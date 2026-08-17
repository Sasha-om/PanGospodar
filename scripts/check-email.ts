/**
 * Ask Resend itself why mail is (or is not) going out.
 *
 *   npm run check:email                    — configuration + verified domains
 *   npm run check:email -- you@example.com — also send a real test letter
 *
 * `check:config` can only see whether the variables are *set*. Everything that
 * actually stops a password-reset email is on Resend's side and invisible from
 * here: a domain added but never verified, a key from a different account, or
 * the shared `onboarding@resend.dev` sender, which may only write to the person
 * who owns the Resend account — so mail to the shop's own address works, every
 * customer gets nothing, and no error appears anywhere.
 *
 * Nothing is printed that a screenshot should not contain: keys are never
 * shown, only whether they work.
 */

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
const from = process.env.ORDER_EMAIL_FROM?.trim() ?? "";
const siteUrl =
  process.env.SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
const recipient = process.argv[2]?.trim() ?? "";

/** Resend accepts both `name@example.com` and `Ім'я <name@example.com>`. */
function bareAddress(value: string): string {
  return value.match(/<([^>]+)>/)?.[1] ?? value;
}

function ok(message: string): void {
  console.log(`  ok   ${message}`);
}
function fail(message: string): void {
  console.error(` FAIL  ${message}`);
}
function warn(message: string): void {
  console.log(` warn  ${message}`);
}

interface Domain {
  name?: string;
  status?: string;
  region?: string;
}

async function main(): Promise<number> {
  console.log("\nНалаштування\n------------");

  if (!apiKey) {
    fail("RESEND_API_KEY не задано — жоден лист не надсилається.");
    console.log(
      "\n  Що робити: resend.com → API Keys → Create → значення у .env.local\n" +
        "  і у Vercel → Settings → Environment Variables, потім Redeploy.\n",
    );
    return 1;
  }
  ok("RESEND_API_KEY задано");

  if (!from) {
    fail(
      "ORDER_EMAIL_FROM не задано — відновлення пароля вимкнено (лист клієнту " +
        "можна слати лише з верифікованого домену).",
    );
  } else {
    ok(`ORDER_EMAIL_FROM = ${from}`);
  }

  if (!siteUrl) {
    warn(
      "SITE_URL не задано — посилання у листі будується з заголовка Host запиту.",
    );
  } else {
    ok(`SITE_URL = ${siteUrl}`);
  }

  /* --------------------------- domains at Resend -------------------------- */

  console.log("\nДомени в Resend\n---------------");

  let domains: Domain[] = [];
  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();

    if (response.status === 401 || response.status === 403) {
      fail(`ключ відхилено (HTTP ${response.status}) — створіть новий у Resend.`);
      return 1;
    }
    if (!response.ok) {
      fail(`Resend відповів HTTP ${response.status}: ${body.slice(0, 200)}`);
      return 1;
    }
    const parsed = JSON.parse(body) as { data?: Domain[] };
    domains = parsed.data ?? [];
  } catch (caught) {
    fail(
      `не вдалося звернутися до Resend: ${caught instanceof Error ? caught.message : String(caught)}`,
    );
    return 1;
  }

  const verified = domains.filter((domain) => domain.status === "verified");
  if (domains.length === 0) {
    fail("жодного домену не додано — див. resend.com → Domains → Add Domain.");
  } else {
    for (const domain of domains) {
      const line = `${domain.name ?? "?"} — ${domain.status ?? "?"}`;
      if (domain.status === "verified") ok(line);
      else fail(`${line} (DNS-записи ще не підтверджені)`);
    }
  }

  const fromDomain = bareAddress(from).split("@")[1] ?? "";
  if (from && fromDomain) {
    const matched = verified.some(
      (domain) =>
        domain.name === fromDomain || fromDomain.endsWith(`.${domain.name}`),
    );
    console.log("");
    if (fromDomain === "resend.dev") {
      fail(
        "відправник onboarding@resend.dev — Resend доставляє з нього ЛИШЕ на " +
          "адресу власника акаунта. Клієнти листів не отримають.",
      );
    } else if (matched) {
      ok(`домен відправника ${fromDomain} верифіковано — листи клієнтам підуть`);
    } else {
      fail(
        `домен відправника ${fromDomain} не входить у список верифікованих — ` +
          "Resend відхилить кожен лист.",
      );
    }
  }

  /* ------------------------------ live send ------------------------------- */

  if (!recipient) {
    console.log(
      "\nЩоб надіслати справжній тестовий лист:\n" +
        "  npm run check:email -- адреса@пошта\n",
    );
    return verified.length > 0 && from ? 0 : 1;
  }

  console.log(`\nТестовий лист на ${recipient}\n${"-".repeat(20)}`);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from || "onboarding@resend.dev",
        to: [recipient],
        subject: "Тест пошти — ПанГосподар",
        html:
          "<p>Це тестовий лист із сайту ПанГосподар. Якщо ви його бачите, " +
          "відновлення пароля працюватиме.</p>",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();

    if (response.ok) {
      ok("Resend прийняв лист. Перевірте вхідні та теку «Спам».");
      return 0;
    }
    fail(`HTTP ${response.status}: ${body.slice(0, 400)}`);
    if (body.includes("testing emails")) {
      console.log(
        "\n  Це і є причина: без верифікованого домену Resend дозволяє слати\n" +
          "  лише на адресу власника акаунта.\n",
      );
    }
    return 1;
  } catch (caught) {
    fail(caught instanceof Error ? caught.message : String(caught));
    return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
