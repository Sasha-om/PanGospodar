import { neon } from "@neondatabase/serverless";
import { unstable_cache } from "next/cache";
import type { Product } from "@/lib/products";
import {
  DEFAULT_STORE_SETTINGS,
  normalizeStoreSettings,
  type StoreSettings,
} from "@/lib/store-settings";
import {
  InsufficientStockError,
  reservesStock,
  type Order,
  type OrderInput,
  type OrderItem,
  type OrderStatus,
  type OrderType,
  type StockShortage,
} from "@/lib/orders";
import type {
  Review,
  ReviewInput,
  ReviewStats,
  ReviewStatus,
} from "@/lib/reviews";
import type { Customer, CustomerWithSecret } from "@/lib/customers";
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
  description?: string | null;
  is_promo?: boolean | null;
  is_bestseller?: boolean | null;
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
  // Marketing copy, written by the admin or by scripts/generate-descriptions.ts.
  // Three states, and the difference matters to that script: NULL means "not
  // looked at yet", empty string means "looked at, nothing reliable to say"
  // (so it is never retried), and text is a real description.
  await sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS description text
  `;
  // Barcode lookups are exact-match, so a plain index is enough.
  await sql`
    CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode)
  `;
  // Merchandising markers set in the admin panel. Like brand/category/image_url
  // these are admin-owned: `upsertProducts` never writes them, so they survive
  // every УкрСклад synchronization.
  await sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS is_promo boolean NOT NULL DEFAULT false
  `;
  await sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS is_bestseller boolean NOT NULL DEFAULT false
  `;
  // Stock can never go below zero. This is the guard that makes overselling
  // impossible: two checkouts racing for the last item both try to write a
  // negative value, Postgres rejects the second, and its whole transaction —
  // order row included — rolls back. NOT VALID skips the scan of existing rows
  // (an older import may have left negatives behind); every write from here on
  // is still checked. Postgres has no ADD CONSTRAINT IF NOT EXISTS, hence the
  // block that swallows the "already there" error on later calls.
  await sql`
    DO $$
    BEGIN
      ALTER TABLE products
        ADD CONSTRAINT products_stock_non_negative CHECK (stock >= 0) NOT VALID;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END
    $$
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
    shortDescription: (row.description ?? "").trim(),
    techSpecs: { power: "", weight: "", warranty: "" },
    attributes: sanitizeAttributes(row.attributes),
    imageUrl: storedImage || LOCAL_PLACEHOLDER,
    categorySlug: safeCategorySlug(storedCategory || inferCategory(name)),
    isPromo: row.is_promo === true,
    isBestseller: row.is_bestseller === true,
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
  isPromo: boolean;
  isBestseller: boolean;
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
  // `products_stock_non_negative` would reject a negative; a negative on-hand
  // count means "none left" anyway, which is how the catalog already reads it.
  const stock = Math.max(0, update.stock);

  await sql`
    INSERT INTO products (
      sku, name, price, stock, brand, category, image_url, barcode,
      attributes, is_promo, is_bestseller, updated_at
    )
    VALUES (
      ${update.sku},
      ${update.name},
      ${update.price},
      ${stock},
      ${update.brand},
      ${update.category},
      ${update.imageUrl},
      ${barcode},
      ${JSON.stringify(update.attributes)}::jsonb,
      ${update.isPromo},
      ${update.isBestseller},
      now()
    )
    ON CONFLICT (sku) DO UPDATE SET
      name          = EXCLUDED.name,
      price         = EXCLUDED.price,
      stock         = EXCLUDED.stock,
      brand         = EXCLUDED.brand,
      category      = EXCLUDED.category,
      image_url     = EXCLUDED.image_url,
      barcode       = EXCLUDED.barcode,
      attributes    = EXCLUDED.attributes,
      is_promo      = EXCLUDED.is_promo,
      is_bestseller = EXCLUDED.is_bestseller,
      updated_at    = now()
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
  // Whether this order currently holds a stock reservation — the flag that
  // makes status changes idempotent. Only a transition that actually flips it
  // moves `products.stock`, so restocking twice is impossible no matter how
  // often "Скасувати" is pressed. Rows that predate stock tracking default to
  // `false`: their stock was never deducted, so cancelling them must not credit
  // quantities back that never left.
  await sql`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS stock_applied boolean NOT NULL DEFAULT false
  `;
  // How the order was placed: cart checkout, "Купити" or "Зарезервувати".
  // Rows that predate the product-page buttons are all cart checkouts, which
  // is exactly what the default backfills them to.
  await sql`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'CART'
  `;
  // "Купують разом" matches baskets with `items @> '[{"sku": "..."}]'`.
  await sql`
    CREATE INDEX IF NOT EXISTS orders_items_gin_idx
    ON orders USING gin (items jsonb_path_ops)
  `;
}

interface OrderRow {
  id: number;
  status: string;
  type: string | null;
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
    type: (row.type as OrderType) ?? "CART",
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

/* ---------------------------- stock movements ---------------------------- */

/**
 * Stock bookkeeping
 * -----------------
 * `products.stock` is the number of units free to sell, so every order holds
 * its quantities out of that pool from the moment it is placed until it is
 * cancelled. Two rules keep the number honest:
 *
 *  1. `orders.stock_applied` records whether an order currently holds a
 *     reservation. A status change only touches stock when it flips that flag,
 *     which is what makes repeated clicks (or two admins at once) harmless.
 *  2. The `products_stock_non_negative` CHECK constraint refuses a deduction
 *     that would oversell. Because the write happens inside a transaction with
 *     the order row, the rejection rolls the order back too.
 *
 * The Neon HTTP driver has no interactive transactions — statements cannot be
 * chosen based on earlier results — so each step below is written as a single
 * self-contained statement and the steps are submitted with `sql.transaction()`.
 */

let stockSchemaReady: Promise<void> | null = null;

/**
 * Ensure both tables and the non-negative-stock constraint exist.
 *
 * Memoized per server process: the statements are idempotent, but each is a
 * round trip and checkout should not pay for them on every order. A failure
 * clears the cache so the next request retries instead of inheriting it.
 */
export function ensureStockSchema(): Promise<void> {
  stockSchemaReady ??= (async () => {
    await ensureProductsTable();
    await ensureOrdersTable();
  })().catch((error: unknown) => {
    stockSchemaReady = null;
    throw error;
  });
  return stockSchemaReady;
}

/** One product and the number of units to move. */
interface StockLine {
  sku: string;
  quantity: number;
}

/**
 * Collapse order items into one line per SKU.
 *
 * An order can list the same SKU twice, and `UPDATE … FROM UNNEST(…)` applies
 * only one row per target — the duplicate would be dropped silently. Items
 * without a SKU (hand-entered names) simply carry no stock: there is no catalog
 * row to move.
 */
function toStockLines(items: OrderItem[]): StockLine[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const sku = String(item?.sku ?? "").trim();
    const quantity = Math.max(0, Math.round(Number(item?.quantity) || 0));
    if (!sku || quantity === 0) {
      continue;
    }
    totals.set(sku, (totals.get(sku) ?? 0) + quantity);
  }
  return [...totals].map(([sku, quantity]) => ({ sku, quantity }));
}

/** Did Postgres reject this write because it would oversell? */
function isStockConstraintError(error: unknown): boolean {
  const detail = error as { code?: string; constraint?: string } | null;
  if (detail?.code === "23514" || detail?.constraint === "products_stock_non_negative") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("products_stock_non_negative");
}

/**
 * Which of these lines the catalog cannot cover right now.
 *
 * Only used to explain a failure — the constraint, not this read, is what
 * actually prevents overselling.
 */
export async function findStockShortages(
  items: OrderItem[],
): Promise<StockShortage[]> {
  const lines = toStockLines(items);
  if (lines.length === 0) {
    return [];
  }
  const sql = getSql();
  const rows = (await sql`
    SELECT
      t.sku,
      COALESCE(p.name, '')          AS name,
      COALESCE(p.stock, 0)::float8  AS available,
      t.qty::float8                 AS required
    FROM UNNEST(
      ${lines.map((line) => line.sku)}::text[],
      ${lines.map((line) => line.quantity)}::numeric[]
    ) AS t(sku, qty)
    LEFT JOIN products p ON p.sku = t.sku
    WHERE p.sku IS NULL OR COALESCE(p.stock, 0) < t.qty
  `) as { sku: string; name: string; available: number; required: number }[];

  return rows.map((row) => ({
    sku: row.sku,
    name: row.name,
    available: Math.max(0, toNumber(row.available)),
    required: toNumber(row.required),
  }));
}

/** Insert a new order and reserve its quantities, both or neither. */
export async function createOrder(input: OrderInput): Promise<Order> {
  const sql = getSql();
  const lines = toStockLines(input.items);

  // Lazily built: `sql.transaction()` needs unexecuted query objects, and a
  // retry after a migration must not reuse an already-sent one.
  const insert = () => sql`
    INSERT INTO orders (
      status, type, first_name, last_name, phone, email, contact_channel,
      city, warehouse, payment_method, comment, items, total, stock_applied
    ) VALUES (
      'NEW',
      ${input.type},
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
      ${input.total},
      ${lines.length > 0}
    )
    RETURNING *
  `;

  const run = async (): Promise<OrderRow[]> => {
    if (lines.length === 0) {
      // Nothing maps to a catalog row, so there is no stock to move.
      return (await insert()) as OrderRow[];
    }
    const [, inserted] = await sql.transaction([
      stockMove(sql, lines, -1),
      insert(),
    ]);
    return inserted as OrderRow[];
  };

  let rows: OrderRow[];
  try {
    rows = await run();
  } catch (caught) {
    if (isStockConstraintError(caught)) {
      // The order was rolled back with the deduction — say what ran out.
      throw new InsufficientStockError(await findStockShortages(input.items));
    }
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureProductsTable();
    await ensureOrdersTable();
    rows = await run();
  }

  return rowToOrder(rows[0]);
}

/**
 * One statement that adds `sign × quantity` to each product's stock.
 * `sign` is -1 to reserve stock for an order and +1 to release it.
 */
function stockMove(
  sql: ReturnType<typeof getSql>,
  lines: StockLine[],
  sign: -1 | 1,
) {
  return sql`
    UPDATE products p
    SET stock      = COALESCE(p.stock, 0) + t.delta,
        updated_at = now()
    FROM UNNEST(
      ${lines.map((line) => line.sku)}::text[],
      ${lines.map((line) => line.quantity * sign)}::numeric[]
    ) AS t(sku, delta)
    WHERE p.sku = t.sku
  `;
}

/** What a status change did to the warehouse. */
export type StockEffect = "reserved" | "released" | "unchanged";

export interface OrderStatusUpdate {
  order: Order;
  stock: StockEffect;
}

/** Thrown when the requested order id is not in the table. */
export class OrderNotFoundError extends Error {
  constructor(id: number) {
    super(`Order #${id} not found`);
    this.name = "OrderNotFoundError";
  }
}

/**
 * Move an order to `status`, adjusting stock if that transition changes whether
 * the order holds a reservation.
 *
 * Cancelling returns the quantities to the catalog; re-opening a cancelled
 * order takes them out again, and fails if they are no longer available. Every
 * other transition leaves stock alone.
 */
export async function setOrderStatus(
  id: number,
  status: OrderStatus,
): Promise<OrderStatusUpdate> {
  const sql = getSql();

  const readCurrent = async () =>
    (await sql`
      SELECT items, COALESCE(stock_applied, false) AS stock_applied
      FROM orders
      WHERE id = ${id}
    `) as { items: unknown; stock_applied: boolean }[];

  let current: { items: unknown; stock_applied: boolean }[];
  try {
    current = await readCurrent();
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureOrdersTable();
    current = await readCurrent();
  }

  const row = current[0];
  if (!row) {
    throw new OrderNotFoundError(id);
  }

  const shouldHold = reservesStock(status);
  const holdsNow = row.stock_applied === true;
  const items = Array.isArray(row.items) ? (row.items as OrderItem[]) : [];
  const lines = toStockLines(items);
  const effect: StockEffect =
    shouldHold === holdsNow || lines.length === 0
      ? "unchanged"
      : shouldHold
        ? "reserved"
        : "released";

  const setStatus = () => sql`
    UPDATE orders SET status = ${status} WHERE id = ${id} RETURNING *
  `;

  /**
   * Claim the reservation flag and move stock in the same statement.
   *
   * The `WHERE … stock_applied = ${holdsNow}` is an optimistic lock: whoever
   * flips the flag first gets rows out of `claimed`, and the product update is
   * gated on that, so a second concurrent (or repeated) cancellation restocks
   * nothing. Being one statement, it is atomic on its own.
   */
  const claimAndMove = () => sql`
    WITH claimed AS (
      UPDATE orders
      SET stock_applied = ${shouldHold}
      WHERE id = ${id} AND COALESCE(stock_applied, false) = ${holdsNow}
      RETURNING id
    ),
    moved AS (
      UPDATE products p
      SET stock      = COALESCE(p.stock, 0) + t.delta,
          updated_at = now()
      FROM UNNEST(
        ${lines.map((line) => line.sku)}::text[],
        ${lines.map((line) => line.quantity * (shouldHold ? -1 : 1))}::numeric[]
      ) AS t(sku, delta)
      WHERE p.sku = t.sku AND EXISTS (SELECT 1 FROM claimed)
      RETURNING p.sku
    )
    SELECT (SELECT count(*) FROM claimed)::int AS claimed,
           (SELECT count(*) FROM moved)::int   AS moved
  `;

  const run = async (): Promise<{ rows: OrderRow[]; applied: StockEffect }> => {
    if (effect === "unchanged") {
      return { rows: (await setStatus()) as OrderRow[], applied: "unchanged" };
    }
    const [claim, updated] = await sql.transaction([claimAndMove(), setStatus()]);
    // Losing the claim means another request already made this move — the
    // status still applies, but reporting a stock change would be a lie.
    const claimed = Number(claim[0]?.claimed ?? 0) > 0;
    return { rows: updated as OrderRow[], applied: claimed ? effect : "unchanged" };
  };

  let result: { rows: OrderRow[]; applied: StockEffect };
  try {
    result = await run();
  } catch (caught) {
    if (isStockConstraintError(caught)) {
      // Nothing was written: the status change rolled back with the deduction.
      throw new InsufficientStockError(await findStockShortages(items));
    }
    throw caught;
  }

  if (!result.rows[0]) {
    throw new OrderNotFoundError(id);
  }
  return { order: rowToOrder(result.rows[0]), stock: result.applied };
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
    // Clamped for `products_stock_non_negative`: УкрСклад can report a negative
    // on-hand balance, and one such row must not abort the whole chunk.
    const stocks = chunk.map((item) => Math.max(0, item.stock));
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

/**
 * SKUs that real customers ordered together with `sku`, most frequent first.
 *
 * Cancelled orders are excluded — those baskets were never actually bought.
 * With a young order table this usually returns nothing, which is expected:
 * the caller tops the list up with rule-based accessories.
 */
export async function findCoPurchasedSkus(
  sku: string,
  limit = 8,
): Promise<string[]> {
  if (!sku.trim() || !hasDatabase()) {
    return [];
  }

  const sql = getSql();
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 20);
  // Containment match on the JSONB basket: `items @> '[{"sku": "..."}]'`.
  const probe = JSON.stringify([{ sku }]);

  try {
    const rows = (await sql`
      WITH baskets AS (
        SELECT id, items
        FROM orders
        WHERE status <> 'CANCELLED' AND items @> ${probe}::jsonb
      ),
      lines AS (
        SELECT b.id, item->>'sku' AS sku
        FROM baskets b, LATERAL jsonb_array_elements(b.items) AS item
      )
      SELECT sku, COUNT(DISTINCT id)::int AS orders
      FROM lines
      WHERE COALESCE(sku, '') <> '' AND sku <> ${sku}
      GROUP BY sku
      ORDER BY orders DESC, sku
      LIMIT ${safeLimit}
    `) as { sku: string; orders: number }[];

    return rows.map((row) => row.sku);
  } catch (caught) {
    // No orders table yet, or a malformed basket — recommendations are a
    // nice-to-have and must never take the product page down.
    if (!isMissingSchemaError(caught)) {
      console.error(
        `[recommendations] Co-purchase lookup failed: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    }
    return [];
  }
}

/* ----------------------------- store settings ---------------------------- */

/**
 * Contact details shown across the site, editable in the admin panel.
 *
 * Stored as key/value rows rather than one wide row: adding a setting later
 * needs no migration, and a half-written value can never blank out a field
 * (`normalizeStoreSettings` falls back to the default per key).
 */
export async function ensureSettingsTable(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS store_settings (
      key        text PRIMARY KEY,
      value      text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

/** Raw read. Returns the defaults when the table or the database is missing. */
async function readStoreSettings(): Promise<StoreSettings> {
  if (!hasDatabase()) {
    return DEFAULT_STORE_SETTINGS;
  }

  const sql = getSql();
  const run = async () =>
    (await sql`SELECT key, value FROM store_settings`) as {
      key: string;
      value: string;
    }[];

  let rows: { key: string; value: string }[];
  try {
    rows = await run();
  } catch (caught) {
    if (!isMissingSchemaError(caught)) {
      // Never break the whole site over a settings read — fall back instead.
      console.error(
        `[settings] Read failed: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
      return DEFAULT_STORE_SETTINGS;
    }
    await ensureSettingsTable();
    rows = [];
  }

  return normalizeStoreSettings(
    Object.fromEntries(rows.map((row) => [row.key, row.value])),
  );
}

/** Invalidated by the admin save action. */
export const STORE_SETTINGS_TAG = "store-settings";

/**
 * Settings as rendered on the site.
 *
 * Cached so the header and footer do not cost a database round trip on every
 * page view. `saveStoreSettings` invalidates the tag, so an edit shows up
 * immediately; the one-minute lifetime is a safety net in case an invalidation
 * is ever missed, rather than the normal path.
 */
export const getStoreSettings = unstable_cache(
  readStoreSettings,
  ["store-settings"],
  { tags: [STORE_SETTINGS_TAG], revalidate: 60 },
);

/** Write every field in one statement. */
export async function saveStoreSettings(values: StoreSettings): Promise<void> {
  const sql = getSql();
  const keys = Object.keys(values);
  const entries = keys.map((key) => values[key as keyof StoreSettings]);

  const run = async () => {
    await sql`
      INSERT INTO store_settings (key, value, updated_at)
      SELECT k, v, now()
      FROM UNNEST(${keys}::text[], ${entries}::text[]) AS t(k, v)
      ON CONFLICT (key) DO UPDATE SET
        value      = EXCLUDED.value,
        updated_at = now()
    `;
  };

  try {
    await run();
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureSettingsTable();
    await run();
  }
}

/* ------------------------------- reviews -------------------------------- */

/** Create the `reviews` table if it does not exist. Idempotent. */
export async function ensureReviewsTable(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id          serial PRIMARY KEY,
      product_sku text NOT NULL,
      author_name text NOT NULL,
      rating      smallint NOT NULL,
      body        text NOT NULL,
      status      text NOT NULL DEFAULT 'PENDING',
      ip_hash     text NOT NULL DEFAULT '',
      created_at  timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5)
    )
  `;
  // The product page reads approved reviews for one SKU, newest first.
  await sql`
    CREATE INDEX IF NOT EXISTS reviews_sku_status_idx
    ON reviews (product_sku, status, created_at DESC)
  `;
  // The moderation queue reads by status.
  await sql`
    CREATE INDEX IF NOT EXISTS reviews_status_created_idx
    ON reviews (status, created_at DESC)
  `;
  // Both rate-limit probes scan by author IP within a time window.
  await sql`
    CREATE INDEX IF NOT EXISTS reviews_ip_created_idx
    ON reviews (ip_hash, created_at DESC)
  `;
}

let reviewsSchemaReady: Promise<void> | null = null;

/** Memoized per process — the DDL is idempotent but costs round trips. */
export function ensureReviewsSchema(): Promise<void> {
  reviewsSchemaReady ??= ensureReviewsTable().catch((error: unknown) => {
    reviewsSchemaReady = null;
    throw error;
  });
  return reviewsSchemaReady;
}

interface ReviewRow {
  id: number;
  product_sku: string;
  author_name: string;
  rating: number;
  body: string;
  status: string;
  ip_hash: string | null;
  created_at: string | Date;
  product_name?: string | null;
}

function rowToReview(row: ReviewRow): Review {
  return {
    id: row.id,
    productSku: row.product_sku,
    authorName: row.author_name ?? "",
    rating: toNumber(row.rating),
    body: row.body ?? "",
    status: (row.status as ReviewStatus) ?? "PENDING",
    ipHash: row.ip_hash ?? "",
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    productName: row.product_name ?? undefined,
  };
}

/**
 * How many reviews this visitor posted recently.
 *
 * Counts every status: a rejected review still used the quota, otherwise a
 * spammer would get unlimited retries by having their posts thrown out.
 */
export async function countRecentReviewsByIp(
  ipHash: string,
  withinHours: number,
): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT count(*)::int AS n
    FROM reviews
    WHERE ip_hash = ${ipHash}
      AND ip_hash <> ''
      AND created_at > now() - make_interval(hours => ${withinHours})
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/** Has this visitor already reviewed this product inside the window? */
export async function hasRecentReviewForProduct(
  ipHash: string,
  productSku: string,
  withinHours: number,
): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    SELECT 1
    FROM reviews
    WHERE ip_hash = ${ipHash}
      AND ip_hash <> ''
      AND product_sku = ${productSku}
      AND created_at > now() - make_interval(hours => ${withinHours})
    LIMIT 1
  `) as unknown[];
  return rows.length > 0;
}

/** Store a new review. Always lands in `PENDING`. */
export async function createReview(input: ReviewInput): Promise<Review> {
  const sql = getSql();
  const run = async () =>
    (await sql`
      INSERT INTO reviews (product_sku, author_name, rating, body, status, ip_hash)
      VALUES (
        ${input.productSku},
        ${input.authorName},
        ${input.rating},
        ${input.body},
        'PENDING',
        ${input.ipHash}
      )
      RETURNING *
    `) as ReviewRow[];

  try {
    return rowToReview((await run())[0]);
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureReviewsTable();
    return rowToReview((await run())[0]);
  }
}

/** Approved reviews for one product, newest first. */
export async function listApprovedReviews(
  productSku: string,
  limit = 50,
): Promise<Review[]> {
  const sql = getSql();
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200);
  try {
    const rows = (await sql`
      SELECT * FROM reviews
      WHERE product_sku = ${productSku} AND status = 'APPROVED'
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `) as ReviewRow[];
    return rows.map(rowToReview);
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    // No table yet simply means no reviews.
    return [];
  }
}

/**
 * The moderation queue. Joins the product name so the admin can tell what is
 * being reviewed without looking the SKU up.
 */
export async function listReviews(limit = 200): Promise<Review[]> {
  const sql = getSql();
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 500);
  try {
    const rows = (await sql`
      SELECT r.*, p.name AS product_name
      FROM reviews r
      LEFT JOIN products p ON p.sku = r.product_sku
      ORDER BY r.created_at DESC
      LIMIT ${safeLimit}
    `) as ReviewRow[];
    return rows.map(rowToReview);
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureReviewsTable();
    return [];
  }
}

export class ReviewNotFoundError extends Error {
  constructor(id: number) {
    super(`Review ${id} not found`);
    this.name = "ReviewNotFoundError";
  }
}

export async function setReviewStatus(
  id: number,
  status: ReviewStatus,
): Promise<Review> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE reviews SET status = ${status} WHERE id = ${id} RETURNING *
  `) as ReviewRow[];
  if (rows.length === 0) {
    throw new ReviewNotFoundError(id);
  }
  return rowToReview(rows[0]);
}

export async function deleteReview(id: number): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM reviews WHERE id = ${id}`;
}

/**
 * Average rating and count per SKU, approved reviews only.
 *
 * Returns an empty map instead of throwing: a catalog page must still render
 * when the reviews table has not been created yet.
 */
export async function loadReviewStats(): Promise<Map<string, ReviewStats>> {
  const stats = new Map<string, ReviewStats>();
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT product_sku, avg(rating)::float8 AS average, count(*)::int AS count
      FROM reviews
      WHERE status = 'APPROVED'
      GROUP BY product_sku
    `) as { product_sku: string; average: number; count: number }[];

    for (const row of rows) {
      stats.set(row.product_sku, {
        average: toNumber(row.average),
        count: row.count,
      });
    }
  } catch (caught) {
    // No `reviews` table yet is the normal state of a fresh install, not a
    // fault — staying quiet keeps it from logging on every catalog read until
    // the first review is submitted.
    if (!isMissingSchemaError(caught)) {
      const detail = caught instanceof Error ? caught.message : String(caught);
      console.warn(`[reviews] Stats unavailable, rendering without them: ${detail}`);
    }
  }
  return stats;
}

/* ------------------------------ customers -------------------------------- */

/** Create the `customers` and `favorites` tables if absent. Idempotent. */
export async function ensureCustomersTable(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS customers (
      id            serial PRIMARY KEY,
      email         text NOT NULL,
      password_hash text NOT NULL,
      name          text NOT NULL DEFAULT '',
      phone         text NOT NULL DEFAULT '',
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `;
  // Email is the login, so uniqueness is enforced by the database rather than
  // by a read-then-write in the action, which two concurrent signups could race.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS customers_email_key ON customers (lower(email))
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS favorites (
      customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      product_sku text NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (customer_id, product_sku)
    )
  `;
  // Orders placed while signed in are owned outright; older ones are matched
  // by phone/email at read time (see `listOrdersForCustomer`).
  await sql`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id integer
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders (customer_id)
  `;
}

let customersSchemaReady: Promise<void> | null = null;

/** Memoized per process; the DDL is idempotent but costs round trips. */
export function ensureCustomersSchema(): Promise<void> {
  customersSchemaReady ??= (async () => {
    await ensureOrdersTable();
    await ensureCustomersTable();
  })().catch((error: unknown) => {
    customersSchemaReady = null;
    throw error;
  });
  return customersSchemaReady;
}

interface CustomerRow {
  id: number;
  email: string;
  password_hash: string;
  name: string | null;
  phone: string | null;
  created_at: string | Date;
}

function rowToCustomer(row: CustomerRow): CustomerWithSecret {
  return {
    id: row.id,
    email: row.email ?? "",
    passwordHash: row.password_hash ?? "",
    name: row.name ?? "",
    phone: row.phone ?? "",
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

/** Raised when a signup collides with the unique email index. */
export class EmailTakenError extends Error {
  constructor() {
    super("Email already registered");
    this.name = "EmailTakenError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  const detail = error as { code?: string } | null;
  if (detail?.code === "23505") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate key|customers_email_key|unique constraint/i.test(message);
}

export async function createCustomer(input: {
  email: string;
  passwordHash: string;
  name: string;
  phone: string;
}): Promise<CustomerWithSecret> {
  const sql = getSql();
  const run = async () =>
    (await sql`
      INSERT INTO customers (email, password_hash, name, phone)
      VALUES (${input.email}, ${input.passwordHash}, ${input.name}, ${input.phone})
      RETURNING *
    `) as CustomerRow[];

  try {
    return rowToCustomer((await run())[0]);
  } catch (caught) {
    if (isUniqueViolation(caught)) throw new EmailTakenError();
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureCustomersTable();
    try {
      return rowToCustomer((await run())[0]);
    } catch (retry) {
      if (isUniqueViolation(retry)) throw new EmailTakenError();
      throw retry;
    }
  }
}

export async function findCustomerByEmail(
  email: string,
): Promise<CustomerWithSecret | null> {
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT * FROM customers WHERE lower(email) = lower(${email}) LIMIT 1
    `) as CustomerRow[];
    return rows.length > 0 ? rowToCustomer(rows[0]) : null;
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureCustomersTable();
    return null;
  }
}

export async function findCustomerById(id: number): Promise<Customer | null> {
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT * FROM customers WHERE id = ${id} LIMIT 1
    `) as CustomerRow[];
    if (rows.length === 0) return null;
    const full = rowToCustomer(rows[0]);
    // The hash never leaves this module for a read-only lookup.
    return {
      id: full.id,
      email: full.email,
      name: full.name,
      phone: full.phone,
      createdAt: full.createdAt,
    };
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureCustomersTable();
    return null;
  }
}

/** Keep the profile in step with what the customer types at checkout. */
export async function updateCustomerContact(
  id: number,
  name: string,
  phone: string,
): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      UPDATE customers
      SET name  = COALESCE(NULLIF(${name}, ''), name),
          phone = COALESCE(NULLIF(${phone}, ''), phone)
      WHERE id = ${id}
    `;
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
  }
}

/* ------------------------------ favorites -------------------------------- */

export async function listFavorites(customerId: number): Promise<string[]> {
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT product_sku FROM favorites
      WHERE customer_id = ${customerId}
      ORDER BY created_at DESC
    `) as { product_sku: string }[];
    return rows.map((row) => row.product_sku);
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    return [];
  }
}

export async function addFavorite(
  customerId: number,
  productSku: string,
): Promise<void> {
  const sql = getSql();
  const run = async () => {
    await sql`
      INSERT INTO favorites (customer_id, product_sku)
      VALUES (${customerId}, ${productSku})
      ON CONFLICT (customer_id, product_sku) DO NOTHING
    `;
  };
  try {
    await run();
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureCustomersTable();
    await run();
  }
}

export async function removeFavorite(
  customerId: number,
  productSku: string,
): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      DELETE FROM favorites
      WHERE customer_id = ${customerId} AND product_sku = ${productSku}
    `;
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
  }
}

/**
 * Merge a guest's locally-stored favourites into the account, in one statement.
 *
 * Runs on every sign-in, so it must be idempotent — `ON CONFLICT DO NOTHING`
 * makes re-merging the same list a no-op rather than an error.
 */
export async function mergeFavorites(
  customerId: number,
  skus: string[],
): Promise<void> {
  const unique = [...new Set(skus.filter((sku) => sku.trim()))];
  if (unique.length === 0) return;

  const sql = getSql();
  const run = async () => {
    await sql`
      INSERT INTO favorites (customer_id, product_sku)
      SELECT ${customerId}, sku FROM UNNEST(${unique}::text[]) AS t(sku)
      ON CONFLICT (customer_id, product_sku) DO NOTHING
    `;
  };
  try {
    await run();
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureCustomersTable();
    await run();
  }
}

/* -------------------------- orders for a customer ------------------------- */

/**
 * A customer's order history.
 *
 * Matches three ways so history is not empty on day one: orders placed while
 * signed in (`customer_id`), plus older guest orders whose email or phone match
 * the account. Email is the reliable key — it is the verified login; the phone
 * match is a convenience, and both are exact comparisons on normalized values.
 */
export async function listOrdersForCustomer(
  customerId: number,
  email: string,
  phone: string,
  limit = 100,
): Promise<Order[]> {
  const sql = getSql();
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200);
  try {
    const rows = (await sql`
      SELECT * FROM orders
      WHERE customer_id = ${customerId}
         OR (${email} <> '' AND lower(email) = lower(${email}))
         OR (${phone} <> '' AND phone = ${phone})
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `) as OrderRow[];
    return rows.map(rowToOrder);
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureCustomersSchema();
    return [];
  }
}

/** Stamp an order with its owner, so it stays linked if contacts change. */
export async function claimOrderForCustomer(
  orderId: number,
  customerId: number,
): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      UPDATE orders SET customer_id = ${customerId}
      WHERE id = ${orderId} AND customer_id IS NULL
    `;
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
  }
}

/* ----------------------- generated product content ----------------------- */

/** One product handed to the description generator. */
export interface GenerationCandidate {
  sku: string;
  name: string;
  brand: string;
  category: string;
  barcode: string;
}

/**
 * Products still waiting for a generated description.
 *
 * `description IS NULL` is the pending marker: the generator writes an empty
 * string when the model does not recognise a product, so an unknown item is
 * recorded as attempted and never picked up again. That makes the run
 * resumable with no side file — the table itself is the checkpoint.
 */
export async function listProductsMissingDescription(
  limit: number,
): Promise<GenerationCandidate[]> {
  const sql = getSql();
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 5000);
  const run = async () =>
    (await sql`
      SELECT sku,
             name,
             COALESCE(brand, '')    AS brand,
             COALESCE(category, '') AS category,
             COALESCE(barcode, '')  AS barcode
      FROM products
      WHERE description IS NULL
      ORDER BY sku
      LIMIT ${safeLimit}
    `) as GenerationCandidate[];

  try {
    return await run();
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureProductsTable();
    return run();
  }
}

/** How many products are still pending / already done. */
export async function countGenerationProgress(): Promise<{
  pending: number;
  described: number;
  unknown: number;
}> {
  const sql = getSql();
  const run = async () =>
    (await sql`
      SELECT
        count(*) FILTER (WHERE description IS NULL)::int        AS pending,
        count(*) FILTER (WHERE description <> '')::int          AS described,
        count(*) FILTER (WHERE description = '')::int           AS unknown
      FROM products
    `) as { pending: number; described: number; unknown: number }[];

  try {
    return (await run())[0];
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureProductsTable();
    return (await run())[0];
  }
}

/**
 * Store generated copy for one product.
 *
 * `description` of `null` records "the model did not recognise this" as an
 * empty string — the site shows nothing, and the next run skips it.
 * Attributes are merged, not replaced: `generated || existing` lets any
 * admin-entered value win a key clash, so a later hand edit is never
 * overwritten by a re-run.
 */
export async function saveGeneratedContent(
  sku: string,
  description: string | null,
  attributes: Record<string, string>,
): Promise<void> {
  const sql = getSql();
  const text = (description ?? "").trim();
  const clean = sanitizeAttributes(attributes);

  await sql`
    UPDATE products
    SET description = ${text},
        attributes  = ${JSON.stringify(clean)}::jsonb || COALESCE(attributes, '{}'::jsonb),
        updated_at  = now()
    WHERE sku = ${sku}
  `;
}
