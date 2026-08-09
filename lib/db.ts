import { neon } from "@neondatabase/serverless";
import type { Product } from "@/lib/products";
import type {
  Order,
  OrderInput,
  OrderItem,
  OrderStatus,
} from "@/lib/orders";
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
/**
 * Row of the `products` table. Every column except sku/name is optional here:
 * the table gains columns over time, and reading must not break when the
 * database has not been migrated yet (`SELECT *` simply omits them).
 */
interface ProductRow {
  sku: string;
  name: string;
  price?: string | number | null;
  stock?: string | number | null;
  attributes?: Record<string, unknown> | null;
  category?: string | null;
  brand?: string | null;
  image_url?: string | null;
  barcode?: string | null;
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

function toNumber(value: string | number | null | undefined): number {
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

/** Does this error mean the table or one of its columns is missing? */
function isMissingSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /does not exist|undefined column|undefined table|relation .* does not exist/i.test(
    message,
  );
}

/**
 * Read the whole catalog from Postgres.
 *
 * Uses `SELECT *` on purpose: the table gains columns over releases, and a
 * fixed column list would throw on a database that has not been migrated yet,
 * silently emptying the catalog. If the schema really is missing, the
 * migration runs once and the read is retried, so the site self-heals instead
 * of needing a manual SQL step.
 */
export async function loadProductsFromDb(): Promise<Product[]> {
  const sql = getSql();

  const read = async () =>
    (await sql`SELECT * FROM products ORDER BY name`) as ProductRow[];

  let rows: ProductRow[];
  try {
    rows = await read();
  } catch (caught) {
    if (!isMissingSchemaError(caught)) {
      throw caught;
    }
    console.warn("[db] products schema missing — running migration and retrying");
    await ensureProductsTable();
    rows = await read();
  }

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

/* ------------------------------- orders --------------------------------- */

/** Create the `orders` table if it does not exist. Idempotent. */
export async function ensureOrdersTable(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id              serial PRIMARY KEY,
      status          text NOT NULL DEFAULT 'NEW',
      first_name      text NOT NULL,
      last_name       text NOT NULL,
      phone           text NOT NULL,
      email           text,
      contact_channel text NOT NULL,
      city            text NOT NULL,
      warehouse       text NOT NULL,
      payment_method  text NOT NULL,
      comment         text,
      items           jsonb NOT NULL DEFAULT '[]'::jsonb,
      total           numeric NOT NULL DEFAULT 0,
      created_at      timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC)
  `;
}

interface OrderRow {
  id: number;
  status: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  contact_channel: string;
  city: string;
  warehouse: string;
  payment_method: string;
  comment: string | null;
  items: unknown;
  total: string | number | null;
  created_at: string | Date;
}

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    status: (row.status as OrderStatus) ?? "NEW",
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    contactChannel: row.contact_channel as Order["contactChannel"],
    city: row.city ?? "",
    warehouse: row.warehouse ?? "",
    paymentMethod: row.payment_method as Order["paymentMethod"],
    comment: row.comment ?? "",
    items: Array.isArray(row.items) ? (row.items as OrderItem[]) : [],
    total: toNumber(row.total),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

/** Insert a new order and return it (with the generated id). */
export async function createOrder(input: OrderInput): Promise<Order> {
  const sql = getSql();
  const run = async () =>
    (await sql`
      INSERT INTO orders (
        status, first_name, last_name, phone, email, contact_channel,
        city, warehouse, payment_method, comment, items, total
      ) VALUES (
        'NEW',
        ${input.firstName},
        ${input.lastName},
        ${input.phone},
        ${input.email},
        ${input.contactChannel},
        ${input.city},
        ${input.warehouse},
        ${input.paymentMethod},
        ${input.comment},
        ${JSON.stringify(input.items)}::jsonb,
        ${input.total}
      )
      RETURNING *
    `) as OrderRow[];

  let rows: OrderRow[];
  try {
    rows = await run();
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureOrdersTable();
    rows = await run();
  }

  return rowToOrder(rows[0]);
}

/** Most recent orders first. */
export async function listOrders(limit = 50): Promise<Order[]> {
  const sql = getSql();
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200);
  const run = async () =>
    (await sql`
      SELECT * FROM orders ORDER BY created_at DESC LIMIT ${safeLimit}
    `) as OrderRow[];

  try {
    return (await run()).map(rowToOrder);
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    // No orders table yet simply means no orders.
    await ensureOrdersTable();
    return [];
  }
}

export interface AdminSearchResult {
  products: Product[];
  /** Total rows matching the query, for paging and the stat card. */
  total: number;
}

/** Escape LIKE wildcards so a literal % or _ in the query is not a wildcard. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Paged admin catalog search, executed in Postgres.
 *
 * The admin list previously filtered the whole catalog in the browser, which
 * meant shipping every row to the client and re-scanning it on each keystroke.
 * Here the database does the work and returns at most `limit` rows.
 *
 * `SELECT *` is deliberate: a fixed column list breaks on a database that has
 * not been migrated yet (that bug emptied the catalog once already), and with
 * LIMIT 20 the column list costs nothing next to the 4700-row saving.
 */
export async function searchProductsForAdmin({
  query,
  limit = 20,
  offset = 0,
}: {
  query: string;
  limit?: number;
  offset?: number;
}): Promise<AdminSearchResult> {
  const sql = getSql();
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);
  const safeOffset = Math.max(0, Math.floor(offset));
  const trimmed = query.trim();

  const run = async (): Promise<AdminSearchResult> => {
    if (!trimmed) {
      // No query: most recently touched products first.
      const rows = (await sql`
        SELECT * FROM products
        ORDER BY updated_at DESC NULLS LAST, name
        LIMIT ${safeLimit} OFFSET ${safeOffset}
      `) as ProductRow[];
      const countRows = (await sql`
        SELECT COUNT(*)::int AS total FROM products
      `) as { total: number }[];
      return {
        products: rows.filter((r) => r.sku).map(rowToProduct),
        total: countRows[0]?.total ?? 0,
      };
    }

    const pattern = `%${escapeLike(trimmed)}%`;
    // Digits-only variant so a scanned barcode with spaces/dashes still matches.
    const digits = trimmed.replace(/[^0-9]/g, "");
    const digitPattern = digits ? `%${digits}%` : null;

    // A factory, not a shared value: each query gets its own fragment so the
    // two statements never share one lazy query object.
    const whereClause = () => sql`
      name ILIKE ${pattern}
      OR sku ILIKE ${pattern}
      OR brand ILIKE ${pattern}
      OR barcode ILIKE ${pattern}
      OR (${digitPattern}::text IS NOT NULL
          AND regexp_replace(COALESCE(barcode, ''), '[^0-9]', '', 'g') ILIKE ${digitPattern})
    `;

    const rows = (await sql`
      SELECT * FROM products
      WHERE ${whereClause()}
      ORDER BY updated_at DESC NULLS LAST, name
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `) as ProductRow[];
    const countRows = (await sql`
      SELECT COUNT(*)::int AS total FROM products WHERE ${whereClause()}
    `) as { total: number }[];

    return {
      products: rows.filter((r) => r.sku).map(rowToProduct),
      total: countRows[0]?.total ?? 0,
    };
  };

  try {
    return await run();
  } catch (caught) {
    if (!isMissingSchemaError(caught)) {
      throw caught;
    }
    console.warn("[db] products schema missing — running migration and retrying");
    await ensureProductsTable();
    return run();
  }
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
