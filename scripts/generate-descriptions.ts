/**
 * Bulk-generate product descriptions and characteristics with the Claude API.
 *
 * Reads products that have no description yet, sends them to Claude in batches,
 * and writes the result back into `products.description` and
 * `products.attributes` — the same JSONB column the admin panel's
 * "Додати характеристику" form writes to, so nothing parallel is created.
 *
 * Resumable by construction: `description IS NULL` is the pending marker, and
 * every processed product gets a value written (an empty string when the model
 * does not recognise it). Re-running after a crash picks up exactly where it
 * stopped, with no side file to keep in sync.
 *
 *   npx tsx scripts/generate-descriptions.ts --limit 30 --dry-run   # preview
 *   npx tsx scripts/generate-descriptions.ts --limit 30             # write 30
 *   npx tsx scripts/generate-descriptions.ts                        # whole catalog
 */

// Next.js loads .env.local for the app; a standalone script has to do it itself.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import Anthropic from "@anthropic-ai/sdk";
import {
  countGenerationProgress,
  hasDatabase,
  listProductsMissingDescription,
  saveGeneratedContent,
  type GenerationCandidate,
} from "../lib/db";

/* --------------------------------- config -------------------------------- */

/**
 * Structured outputs guarantee the response matches the schema below, which is
 * what makes "strict JSON, no preamble, no markdown fence" an API-level
 * guarantee rather than a prompt instruction the model may drift from. Only
 * models that support the feature will do — Sonnet 4.6 does not.
 */
const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";

const BATCH_SIZE = Number(process.env.GEN_BATCH_SIZE ?? 25);
/** Pause between requests. The SDK also retries 429s on its own. */
const DELAY_MS = Number(process.env.GEN_DELAY_MS ?? 2000);
/** Extra wait after a rate-limit error before the batch is retried. */
const RATE_LIMIT_BACKOFF_MS = Number(process.env.GEN_BACKOFF_MS ?? 30_000);
const MAX_BATCH_RETRIES = 3;

/**
 * Preferred attribute labels.
 *
 * The catalog builds its filters from attribute keys, so "Потужність" and
 * "Потужність двигуна" would split one filter into two. Giving the model a
 * fixed vocabulary keeps 4,700 products on one set of keys.
 */
const ATTRIBUTE_VOCABULARY = [
  "Потужність",
  "Вага",
  "Гарантія",
  "Об'єм двигуна",
  "Тип двигуна",
  "Довжина шини",
  "Крок ланцюга",
  "Кількість ланок",
  "Ширина скошування",
  "Об'єм бака",
  "Напруга",
  "Ємність акумулятора",
  "Тиск",
  "Продуктивність",
  "Тип",
  "Матеріал",
  "Розмір",
  "Країна виробництва",
] as const;

/* --------------------------------- prompt -------------------------------- */

const SYSTEM_PROMPT = `Ти — технічний експерт з садової, будівельної та господарської техніки. Ти складаєш описи та характеристики товарів для українського інтернет-магазину.

ГОЛОВНЕ ПРАВИЛО — ЧЕСНІСТЬ ВАЖЛИВІША ЗА ПОВНОТУ.

Заповнюй лише те, що ти дійсно знаєш про цю конкретну модель.

ЗАБОРОНЕНО вигадувати числові характеристики. Це стосується потужності, ваги, об'єму двигуна, довжини шини, кроку ланцюга, кількості ланок, напруги, ємності акумулятора, тиску, продуктивності та будь-яких інших чисел. Якщо ти не пам'ятаєш точного значення для цієї конкретної моделі — не вказуй його взагалі. Порожнє поле краще за неправильне. Не округлюй, не оцінюй "приблизно", не бери значення від схожої моделі.

Якщо товар незрозумілий, назва занадто загальна, або ти не впізнаєш конкретну модель — поверни description: null і attributes: {}. Це нормальна і очікувана відповідь, не намагайся її уникнути.

Якщо модель тобі добре відома (наприклад STIHL MS 180, Bosch GSR 120-LI, Makita HR2470, Oregon 91P) — заповнюй максимально повно: і опис, і всі характеристики, які ти знаєш напевно.

ОПИС (description):
- 2-4 речення українською мовою
- Що це за товар, для чого призначений, ключові переваги
- Без маркетингових перебільшень ("найкращий у світі", "неперевершений")
- Без вигаданих фактів, без згадок ціни, без закликів купити
- Якщо знаєш тільки категорію товару, але не конкретну модель — краще null

ХАРАКТЕРИСТИКИ (attributes):
- Масив пар {"name": назва, "value": значення}, українською
- Використовуй ЛИШЕ ці назви, коли вони підходять: ${ATTRIBUTE_VOCABULARY.join(", ")}
- Значення з одиницями виміру: "2.3 кВт", "4.6 кг", "40 см", "18 В"
- Тільки ті характеристики, які ти знаєш точно для цієї моделі
- Порожній масив [] — прийнятна відповідь

Обробляй кожен товар незалежно. Незнання одного товару не впливає на інші.`;

/**
 * The response schema — structured outputs enforce this exactly, which is what
 * makes the "strict JSON, no fence" requirement an API guarantee.
 *
 * Two shapes are dictated by what structured outputs accept, not by taste:
 * nullability must be spelled with `anyOf` (a `type: [...]` union is not
 * supported), and `additionalProperties` may only ever be `false` — so the
 * characteristics travel as a name/value array rather than a free-form object
 * and are folded back into a map below.
 */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sku: {
            type: "string",
            description: "Код товару, точно як у запиті",
          },
          description: {
            anyOf: [{ type: "string" }, { type: "null" }],
            description:
              "Опис українською (2-4 речення), або null якщо модель невідома",
          },
          attributes: {
            type: "array",
            description:
              "Характеристики. Порожній масив, якщо нічого не відомо напевно.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Назва характеристики" },
                value: {
                  type: "string",
                  description: "Значення з одиницею виміру, напр. «2.3 кВт»",
                },
              },
              required: ["name", "value"],
              additionalProperties: false,
            },
          },
        },
        required: ["sku", "description", "attributes"],
        additionalProperties: false,
      },
    },
  },
  required: ["products"],
  additionalProperties: false,
} as const;

/** Wire shape, straight off the schema above. */
interface RawItem {
  sku: string;
  description: string | null;
  attributes: { name: string; value: string }[];
}

interface GeneratedItem {
  sku: string;
  description: string | null;
  attributes: Record<string, string>;
}

/** Fold the name/value pairs into the map shape the products table stores. */
function toAttributeMap(
  pairs: { name: string; value: string }[] | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const pair of pairs ?? []) {
    const name = String(pair?.name ?? "").trim();
    const value = String(pair?.value ?? "").trim();
    if (name && value) {
      map[name] = value;
    }
  }
  return map;
}

/* ------------------------------- generation ------------------------------ */

const client = new Anthropic({
  // The SDK already backs off on 429 and 5xx; a few extra attempts make a long
  // unattended run survive a transient rate-limit spike without dying.
  maxRetries: 5,
});

function buildUserPrompt(batch: GenerationCandidate[]): string {
  const lines = batch.map((product, index) => {
    const parts = [`${index + 1}. Код: ${product.sku}`, `Назва: ${product.name}`];
    if (product.brand) parts.push(`Бренд: ${product.brand}`);
    if (product.category) parts.push(`Категорія: ${product.category}`);
    if (product.barcode) parts.push(`Артикул: ${product.barcode}`);
    return parts.join(" | ");
  });

  return `Склади опис і характеристики для кожного з цих ${batch.length} товарів. Поверни рівно ${batch.length} об'єктів, по одному на кожен код, у тому ж порядку.

${lines.join("\n")}`;
}

async function generateBatch(
  batch: GenerationCandidate[],
): Promise<GeneratedItem[]> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    // Thinking off keeps a 190-request run affordable; the schema constrains
    // the shape and the system prompt carries the "do not invent" rule.
    // Set GEN_THINKING=1 to trade cost for more deliberation per product.
    thinking:
      process.env.GEN_THINKING === "1"
        ? { type: "adaptive" }
        : { type: "disabled" },
    output_config: {
      effort: (process.env.GEN_EFFORT?.trim() as "low" | "medium" | "high") ||
        "medium",
      format: {
        type: "json_schema",
        schema: RESPONSE_SCHEMA,
      },
    },
    messages: [{ role: "user", content: buildUserPrompt(batch) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      `Модель відхилила запит (${response.stop_details?.category ?? "без категорії"})`,
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Відповідь обрізана за max_tokens — зменште GEN_BATCH_SIZE");
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const parsed = JSON.parse(text) as { products: RawItem[] };
  if (!Array.isArray(parsed.products)) {
    return [];
  }
  return parsed.products.map((item) => ({
    sku: String(item.sku ?? "").trim(),
    description: item.description?.trim() ? item.description.trim() : null,
    attributes: toAttributeMap(item.attributes),
  }));
}

/* --------------------------------- runner -------------------------------- */

function parseArgs() {
  const argv = process.argv.slice(2);
  const limitIndex = argv.indexOf("--limit");
  return {
    dryRun: argv.includes("--dry-run"),
    limit:
      limitIndex >= 0 && argv[limitIndex + 1]
        ? Math.max(1, Number(argv[limitIndex + 1]))
        : Infinity,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRateLimit(error: unknown): boolean {
  return error instanceof Anthropic.RateLimitError;
}

function preview(item: GeneratedItem, product: GenerationCandidate) {
  const attrs = Object.entries(item.attributes ?? {});
  console.log(`\n  ── ${product.sku} — ${product.name}`);
  if (!item.description) {
    console.log("     ✗ модель не впізнала товар → опис порожній");
  } else {
    console.log(`     ✓ ${item.description}`);
  }
  console.log(
    attrs.length > 0
      ? `     ⚙  ${attrs.map(([k, v]) => `${k}: ${v}`).join(" · ")}`
      : "     ⚙  (характеристик немає)",
  );
}

async function main() {
  const { dryRun, limit } = parseArgs();

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error(
      "✗ ANTHROPIC_API_KEY не заданий. Додайте його у .env.local (див. README).",
    );
    process.exit(1);
  }
  if (!hasDatabase()) {
    console.error(
      "✗ Немає рядка підключення до бази. Задайте STORAGE_DATABASE_URL у .env.local.",
    );
    process.exit(1);
  }

  const progress = await countGenerationProgress();
  console.log("═".repeat(64));
  console.log(`Модель:        ${MODEL}`);
  console.log(`Розмір пачки:  ${BATCH_SIZE}`);
  console.log(`Пауза:         ${DELAY_MS} мс між запитами`);
  console.log(
    `Стан бази:     ${progress.pending} без опису · ${progress.described} з описом · ${progress.unknown} невпізнаних`,
  );
  if (dryRun) {
    console.log("Режим:         ТЕСТОВИЙ — у базу нічого не записується");
  }
  console.log("═".repeat(64));

  const wanted = Number.isFinite(limit) ? (limit as number) : progress.pending;
  const products = await listProductsMissingDescription(wanted);
  if (products.length === 0) {
    console.log("\n✓ Усі товари вже оброблено — нічого робити.");
    return;
  }

  const totalBatches = Math.ceil(products.length / BATCH_SIZE);
  const startedAt = Date.now();
  let described = 0;
  let unknown = 0;
  let failed = 0;

  for (let index = 0; index < totalBatches; index += 1) {
    const batch = products.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE);
    const label = `[${index + 1}/${totalBatches}]`;

    let items: GeneratedItem[] | null = null;
    for (let attempt = 1; attempt <= MAX_BATCH_RETRIES; attempt += 1) {
      try {
        items = await generateBatch(batch);
        break;
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : String(caught);
        const wait = isRateLimit(caught)
          ? RATE_LIMIT_BACKOFF_MS * attempt
          : 2000 * attempt;
        if (attempt === MAX_BATCH_RETRIES) {
          console.error(`${label} ✗ пачку пропущено: ${message}`);
          failed += batch.length;
        } else {
          console.warn(
            `${label} ⚠ спроба ${attempt} не вдалася (${message}) — чекаю ${Math.round(wait / 1000)} с`,
          );
          await sleep(wait);
        }
      }
    }

    if (items) {
      // Index by SKU: the model is asked to keep order, but matching by code
      // means a reordered or short response still lands on the right products
      // instead of silently shifting descriptions onto neighbouring items.
      const bySku = new Map(items.map((item) => [String(item.sku), item]));

      for (const product of batch) {
        const item = bySku.get(product.sku);
        if (!item) {
          console.warn(`${label} ⚠ ${product.sku}: немає у відповіді`);
          failed += 1;
          continue;
        }
        // `generateBatch` already normalised description and attributes.
        const { description, attributes } = item;

        if (dryRun) {
          preview(item, product);
        } else {
          await saveGeneratedContent(product.sku, description, attributes);
        }
        if (description) described += 1;
        else unknown += 1;
      }

      const done = described + unknown + failed;
      const rate = done / ((Date.now() - startedAt) / 1000);
      const remaining = products.length - done;
      const eta = rate > 0 ? Math.round(remaining / rate) : 0;
      console.log(
        `${label} ✓ ${done}/${products.length} · описів ${described} · невпізнаних ${unknown} · помилок ${failed}` +
          (remaining > 0 ? ` · залишилось ~${Math.round(eta / 60)} хв` : ""),
      );
    }

    if (index < totalBatches - 1) {
      await sleep(DELAY_MS);
    }
  }

  const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log("\n" + "═".repeat(64));
  console.log(`Готово за ${minutes} хв`);
  console.log(`  Описів створено:    ${described}`);
  console.log(`  Модель не впізнала: ${unknown}`);
  console.log(`  Помилок:            ${failed}`);
  if (dryRun) {
    console.log("\n  ТЕСТОВИЙ РЕЖИМ — у базу нічого не записано.");
    console.log("  Приберіть --dry-run, щоб зберегти результат.");
  }
  console.log("═".repeat(64));
}

main().catch((error: unknown) => {
  console.error("\n✗ Скрипт зупинився:", error);
  process.exit(1);
});
