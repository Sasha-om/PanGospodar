import { neon } from "@neondatabase/serverless";
import type { Product } from "@/lib/products";
import {
  LOCAL_PLACEHOLDER,
  detectBrand,
  inferCategory,
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
}

/** Map a database row onto the site's `Product` shape. */
function rowToProduct(row: ProductRow): Product {
  const name = (row.name ?? "").trim();
  const quantity = Math.max(0, Math.round(toNumber(row.stock)));

  return {
    id: row.sku,
    sku: row.sku,
    name,
    brand: detectBrand("", name),
    price: toNumber(row.price),
    quantity,
    inStock: quantity > 0,
    shortDescription: "",
    techSpecs: { power: "", weight: "", warranty: "" },
    imageUrl: LOCAL_PLACEHOLDER,
    categorySlug: inferCategory(name),
  };
}

/** Read the whole catalog from Postgres. */
export async function loadProductsFromDb(): Promise<Product[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT sku, name, price, stock
    FROM products
    ORDER BY name
  `) as ProductRow[];

  return rows
    .filter((row) => row.sku && (row.name ?? "").trim() !== "")
    .map(rowToProduct);
}

export interface ImportItem {
  sku: string;
  name: string;
  price: number;
  stock: number;
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

    await sql`
      INSERT INTO products (sku, name, price, stock, updated_at)
      SELECT s, n, p, st, now()
      FROM UNNEST(
        ${skus}::text[],
        ${names}::text[],
        ${prices}::numeric[],
        ${stocks}::numeric[]
      ) AS t(s, n, p, st)
      ON CONFLICT (sku) DO UPDATE SET
        name       = EXCLUDED.name,
        price      = EXCLUDED.price,
        stock      = EXCLUDED.stock,
        updated_at = now()
    `;

    affected += chunk.length;
  }

  return affected;
}
