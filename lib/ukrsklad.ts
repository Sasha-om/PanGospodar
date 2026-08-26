import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { products as fallbackProducts, type Product } from "@/lib/products";
// Type-only import — erased at build time, so there is no circular dependency.
import type { LoadProductsResult } from "@/lib/catalog";
import {
  detectBrand,
  inferCategory,
  mapCategory,
  resolveImage,
  safeCategorySlug,
} from "@/lib/product-mapping";

/**
 * Server-only data layer for the УкрСклад synchronization file.
 *
 * Supports XML, JSON and CSV exports (УкрСклад CSV is UTF-16 LE, `;`-delimited).
 * Reads a local file (or a folder containing one) from `UKR_SKLAD_FILE_PATH`.
 *
 * This is the legacy/offline source — Turso is the production source of
 * truth. See `lib/catalog.ts`, which picks between them.
 */

type RawItem = Record<string, unknown>;

/** Field name candidates (UA/RU/EN + УкрСклад CSV headers), matched case-insensitively. */
const FIELD_ALIASES = {
  id: ["код", "артикул", "code", "article", "sku", "ід", "id", "ид"],
  name: [
    "повна назва товару",
    "назва",
    "найменування",
    "наименование",
    "name",
    "title",
    "товар",
  ],
  price: [
    "розд. ціна",
    "роздрібна ціна",
    "розд.ціна",
    "цінароздрібна",
    "цінапродажу",
    "ціна",
    "цена",
    "price",
    "retailprice",
  ],
  quantity: [
    "к-ть",
    "кількість",
    "залишок",
    "остаток",
    "количество",
    "quantity",
    "qty",
    "stock",
    "count",
    "наявність",
  ],
  category: ["група", "категорія", "категория", "group", "category", "розділ"],
  brand: ["виробник", "производитель", "бренд", "brand", "manufacturer", "торговамарка", "tm"],
  barcode: ["штрих-код виробника", "штрих-код", "штрихкод", "barcode", "ean"],
  description: ["додатково", "опис", "описание", "description", "примітка"],
  image: ["фото", "зображення", "image", "imageurl", "photo", "картинка"],
  power: ["потужність", "мощность", "power"],
  weight: ["вага", "вес", "weight"],
  warranty: ["гарантія", "гарантия", "warranty"],
} as const;


/* ------------------------------- helpers -------------------------------- */

function toLookup(item: RawItem): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(item)) {
    const normalized = key.replace(/^@_/, "").trim().toLowerCase();
    if (!map.has(normalized)) {
      map.set(normalized, value);
    }
  }
  return map;
}

function pick(lookup: Map<string, unknown>, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    const value = lookup.get(alias);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function toText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") {
    const text = (value as Record<string, unknown>)["#text"];
    return text === undefined ? "" : String(text).trim();
  }
  return String(value).trim();
}

function toNumber(value: unknown): number {
  const text = toText(value)
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function normalizeItem(item: RawItem, index: number): Product | null {
  const lookup = toLookup(item);

  const name = toText(pick(lookup, FIELD_ALIASES.name));
  if (!name) return null;

  const rawId = toText(pick(lookup, FIELD_ALIASES.id));
  const sku = rawId || `ukr-${index + 1}`;
  const id = sku.replace(/\s+/g, "-");

  const price = toNumber(pick(lookup, FIELD_ALIASES.price));
  const quantity = Math.max(0, Math.round(toNumber(pick(lookup, FIELD_ALIASES.quantity))));

  const rawCategory = toText(pick(lookup, FIELD_ALIASES.category));
  const categorySlug = rawCategory ? mapCategory(rawCategory) : inferCategory(name);

  const brand = detectBrand(toText(pick(lookup, FIELD_ALIASES.brand)), name);

  return {
    id,
    sku,
    name,
    brand,
    price,
    quantity,
    inStock: quantity > 0,
    barcode: toText(pick(lookup, FIELD_ALIASES.barcode)) || undefined,
    shortDescription: toText(pick(lookup, FIELD_ALIASES.description)),
    techSpecs: {
      power: toText(pick(lookup, FIELD_ALIASES.power)),
      weight: toText(pick(lookup, FIELD_ALIASES.weight)),
      warranty: toText(pick(lookup, FIELD_ALIASES.warranty)),
    },
    imageUrl: resolveImage(toText(pick(lookup, FIELD_ALIASES.image))),
    categorySlug: safeCategorySlug(categorySlug),
  };
}

function ensureUniqueIds(products: Product[]): Product[] {
  const seen = new Map<string, number>();
  return products.map((product) => {
    const count = seen.get(product.id) ?? 0;
    seen.set(product.id, count + 1);
    return count === 0 ? product : { ...product, id: `${product.id}-${count + 1}` };
  });
}

/* ------------------------------- parsing -------------------------------- */

/** Decode a file buffer, honouring UTF-16 (LE/BE) and UTF-8 byte-order marks. */
function decodeBuffer(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le", 2);
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return swapped.toString("utf16le");
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString("utf8", 3);
  }
  return buffer.toString("utf8");
}

/** RFC-4180-style parser adapted for a `;` delimiter and `""` quote escaping. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ";") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseCsv(text: string): RawItem[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows
    .slice(1)
    .filter((cells) => cells.some((cell) => cell.trim() !== ""))
    .map((cells) => {
      const item: RawItem = {};
      headers.forEach((header, columnIndex) => {
        item[header] = cells[columnIndex] ?? "";
      });
      return item;
    });
}

function parseFile(raw: string, extension: string): RawItem[] {
  if (extension === ".csv") {
    return parseCsv(raw);
  }
  if (extension === ".json") {
    return findItemsArray(JSON.parse(raw));
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    parseTagValue: true,
  });
  return findItemsArray(parser.parse(raw));
}

/** Recursively find the most likely array of item objects in a parsed tree. */
function findItemsArray(node: unknown): RawItem[] {
  if (Array.isArray(node)) {
    const objects = node.filter(
      (entry): entry is RawItem =>
        typeof entry === "object" && entry !== null && !Array.isArray(entry),
    );
    if (objects.length > 0) return objects;
  }
  if (node && typeof node === "object") {
    let best: RawItem[] = [];
    for (const value of Object.values(node as Record<string, unknown>)) {
      const found = findItemsArray(value);
      if (found.length > best.length) best = found;
    }
    return best;
  }
  return [];
}

/** If the configured path is a folder, pick a data file inside it. */
async function resolveSourceFile(configuredPath: string): Promise<string> {
  const absolutePath = path.resolve(configuredPath);
  const info = await stat(absolutePath);
  if (!info.isDirectory()) {
    return absolutePath;
  }
  const entries = await readdir(absolutePath);
  const preferred =
    entries.find((entry) => /^products\.(csv|xml|json)$/i.test(entry)) ??
    entries.find((entry) => /\.(csv|xml|json)$/i.test(entry));
  if (!preferred) {
    throw new Error(`No .csv/.xml/.json file found in directory ${absolutePath}`);
  }
  return path.join(absolutePath, preferred);
}

/* ------------------------------- loader --------------------------------- */

export async function loadProductsFromFile(): Promise<LoadProductsResult> {
  const loadedAt = new Date().toISOString();
  const configuredPath = process.env.UKR_SKLAD_FILE_PATH?.trim();

  if (!configuredPath) {
    const error =
      "UKR_SKLAD_FILE_PATH is not set — no product source configured, catalog is empty.";
    console.warn(`[ukrsklad] ${error}`);
    return { products: fallbackProducts, source: "fallback", error, loadedAt };
  }

  try {
    const filePath = await resolveSourceFile(configuredPath);
    const buffer = await readFile(filePath);
    const raw = decodeBuffer(buffer);
    const items = parseFile(raw, path.extname(filePath).toLowerCase());

    const normalized = ensureUniqueIds(
      items
        .map((item, index) => normalizeItem(item, index))
        .filter((product): product is Product => product !== null),
    );

    if (normalized.length === 0) {
      const error = "Sync file parsed but contained no valid products.";
      console.error(`[ukrsklad] ${error}`);
      return { products: fallbackProducts, source: "fallback", error, loadedAt };
    }

    console.info(`[ukrsklad] Loaded ${normalized.length} products from ${filePath}`);
    return { products: normalized, source: "ukrsklad", loadedAt };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[ukrsklad] Failed to read/parse sync file: ${message}`);
    return { products: fallbackProducts, source: "fallback", error: message, loadedAt };
  }
}
