import { neon } from "@neondatabase/serverless";
import type { Product } from "@/lib/products";
import {
  LOCAL_PLACEHOLDER,
  detectBrand,
  inferCategory,
  safeCategorySlug,
} from "@/lib/product-mapping";

/**
 * Neon Postgres access for the product catalog.
 *
 * The connection string is read from the first environment variable that is
 * set — Vercel's Neon integration provisions `POSTGRES_URL`, while some setups
 * expose `STORAGE_URL` or `DATABASE_URL` instead.
 */

/**
 * Checked in order. The Vercel↔Neon integration on this project provisions the
 * `STORAGE_`-prefixed names, so those come first; the unprefixed variants are
 * kept for other setups and local development.
 */
export const CONNECTION_ENV_VARS = [
  "STORAGE_DATABASE_URL",
  "STORAGE_POSTGRES_URL",
  "STORAGE_POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL",
  "DATABASE_URL",
  "STORAGE_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
] as const;

/** Name of the env var that supplied the connection string (for diagnostics). */
export function getConnectionSource(): string | undefined {
  return CONNECTION_ENV_VARS.find((key) => process.env[key]?.trim());
}

export function getConnectionString(): string | undefined {
  const key = getConnectionSource();
  return key ? process.env[key]?.trim() : undefined;
}

/** True when a Postgres connection string is configured. */
export function hasDatabase(): boolean {
  return getConnectionString() !== undefined;
}

function getSql() {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error(
      `No database connection string. Set one of: ${CONNECTION_ENV_VARS.join(", ")}`,
    );
  }
  return neon(connectionString);
}

/** Row shape of the `products` table. `numeric` comes back as a string. */
interface ProductRow {
  sku: string;
  name: string;
  price: string | number | null;
  stock: string | number | null;
  attributes: Record<string, unknown> | null;
  category: string | null;
  brand: string | null;
  image_url: string | null;
  barcode: string | null;
}

/** Keep only non-empty string pairs — the UI and filters assume clean data. */
export function sanitizeAttributes(
  raw: unknown,
): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const label = key.trim();
    const text = String(value ?? "").trim();
    if (label && text) {
      clean[label] = text;
    }
  }
  return clean;
}

function toNumber(value: string | number | null): number {
  const num = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Create the `products` table if it does not exist yet. Safe to call on every
 * import request — `IF NOT EXISTS` makes it a no-op once the table is there.
 */
export async function ensureProductsTable(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      sku        text PRIMARY KEY,
      name       text NOT NULL,
      price      numeric,
      stock      numeric,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  // Added after the initial release — safe to run on existing databases.
  await sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb
  `;
  await sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS category text
  `;
  await sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS brand text
  `;
  await sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS image_url text
  `;
  await sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS barcode text
  `;
  // Barcode lookups are exact-match, so a plain index is enough.
  await sql`
    CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode)
  `;
}

/** Map a database row onto the site's `Product` shape. */
function rowToProduct(row: ProductRow): Product {
  const name = (row.name ?? "").trim();
  const quantity = Math.max(0, Math.round(toNumber(row.stock)));
  const storedCategory = (row.category ?? "").trim();
  const storedBrand = (row.brand ?? "").trim();
  const storedImage = (row.image_url ?? "").trim();
  // Nullable in the database and optional everywhere downstream.
  const storedBarcode = (row.barcode ?? "").trim();

  return {
    id: row.sku,
    sku: row.sku,
    barcode: storedBarcode || undefined,
    name,
    // An admin-set value wins; otherwise fall back to inference from the name.
    brand: storedBrand || detectBrand("", name),
    price: toNumber(row.price),
    quantity,
    inStock: quantity > 0,
    shortDescription: "",
    techSpecs: { power: "", weight: "", warranty: "" },
    attributes: sanitizeAttributes(row.attributes),
    imageUrl: storedImage || LOCAL_PLACEHOLDER,
    categorySlug: safeCategorySlug(storedCategory || inferCategory(name)),
  };
}

/** Read the whole catalog from Postgres. */
export async function loadProductsFromDb(): Promise<Product[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT sku, name, price, stock, attributes, category, brand, image_url, barcode
    FROM products
    ORDER BY name
  `) as ProductRow[];

  return rows
    .filter((row) => row.sku && (row.name ?? "").trim() !== "")
    .map(rowToProduct);
}

export interface AdminProductUpdate {
  sku: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  stock: number;
  imageUrl: string;
  /** Empty string clears the barcode (stored as NULL). */
  barcode: string;
  attributes: Record<string, string>;
}

/**
 * Persist admin edits for a single product.
 *
 * Only the columns the admin form owns are written; `updated_at` is refreshed.
 * The УкрСклад import keeps overwriting name/price/stock on its next run — the
 * admin-owned columns (brand, category, image_url, attributes) are never
 * touched by that import, so they survive synchronization.
 */
export async function updateProductFromAdmin(
  update: AdminProductUpdate,
): Promise<void> {
  const sql = getSql();
  // The admin owns this field, so an empty box genuinely means "no barcode".
  const barcode = update.barcode.trim() === "" ? null : update.barcode.trim();

  await sql`
    INSERT INTO products (
      sku, name, price, stock, brand, category, image_url, barcode,
      attributes, updated_at
    )
    VALUES (
      ${update.sku},
      ${update.name},
      ${update.price},
      ${update.stock},
      ${update.brand},
      ${update.category},
      ${update.imageUrl},
      ${barcode},
      ${JSON.stringify(update.attributes)}::jsonb,
      now()
    )
    ON CONFLICT (sku) DO UPDATE SET
      name       = EXCLUDED.name,
      price      = EXCLUDED.price,
      stock      = EXCLUDED.stock,
      brand      = EXCLUDED.brand,
      category   = EXCLUDED.category,
      image_url  = EXCLUDED.image_url,
      barcode    = EXCLUDED.barcode,
      attributes = EXCLUDED.attributes,
      updated_at = now()
  `;
}

/** Remove a product entirely. */
export async function deleteProductBySku(sku: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM products WHERE sku = ${sku}`;
}

export interface ImportItem {
  sku: string;
  name: string;
  price: number;
  stock: number;
  /** Optional — many products have no barcode. */
  barcode?: string | null;
}

/** Postgres rejects two updates of the same key in one statement — dedupe first. */
function dedupeBySku(items: ImportItem[]): ImportItem[] {
  const map = new Map<string, ImportItem>();
  for (const item of items) {
    map.set(item.sku, item); // last occurrence wins
  }
  return [...map.values()];
}

const CHUNK_SIZE = 500;

/**
 * Upsert products by `sku`. Inserts new rows, updates existing ones, and always
 * refreshes `updated_at`. Uses one statement per chunk (via UNNEST) rather than
 * one round trip per item — important over Neon's HTTP driver.
 *
 * @returns how many rows were inserted or updated
 */
export async function upsertProducts(items: ImportItem[]): Promise<number> {
  const unique = dedupeBySku(items);
  if (unique.length === 0) {
    return 0;
  }

  const sql = getSql();
  let affected = 0;

  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);

    const skus = chunk.map((item) => item.sku);
    const names = chunk.map((item) => item.name);
    const prices = chunk.map((item) => item.price);
    const stocks = chunk.map((item) => item.stock);
    // Empty string -> NULL so "no barcode" is stored as NULL, not "".
    const barcodes = chunk.map((item) => {
      const value = (item.barcode ?? "").trim();
      return value === "" ? null : value;
    });

    await sql`
      INSERT INTO products (sku, name, price, stock, barcode, updated_at)
      SELECT s, n, p, st, bc, now()
      FROM UNNEST(
        ${skus}::text[],
        ${names}::text[],
        ${prices}::numeric[],
        ${stocks}::numeric[],
        ${barcodes}::text[]
      ) AS t(s, n, p, st, bc)
      ON CONFLICT (sku) DO UPDATE SET
        name       = EXCLUDED.name,
        price      = EXCLUDED.price,
        stock      = EXCLUDED.stock,
        -- Keep a previously stored barcode when this import omits one,
        -- so a feed without barcodes does not wipe existing values.
        barcode    = COALESCE(EXCLUDED.barcode, products.barcode),
        updated_at = now()
    `;

    affected += chunk.length;
  }

  return affected;
}
