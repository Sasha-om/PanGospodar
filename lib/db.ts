import { unstable_cache } from "next/cache";
import {
  ago,
  fromJson,
  getDatabaseUrl,
  hasTurso,
  isCheckViolation,
  isMissingSchema,
  isUniqueViolation as isLibsqlUniqueViolation,
  jsonRows,
  now,
  sql,
  toBool,
  TURSO_TOKEN_ENV,
  TURSO_URL_ENV,
  type SqlQuery,
} from "@/lib/libsql";
import { MAX_PRODUCT_IMAGES, type Product } from "@/lib/products";
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
  CATEGORY_FALLBACK,
  CATEGORY_RULES,
  COUNTRY_VALUES,
  KNOWN_BRANDS,
  KNOWN_SLUGS,
  LOCAL_PLACEHOLDER,
  detectBrand,
  inferCategory,
  safeCategorySlug,
} from "@/lib/product-mapping";

/**
 * Turso (libSQL/SQLite) access for the product catalog.
 *
 * The connection is configured with `TURSO_DATABASE_URL` and, for a remote
 * database, `TURSO_AUTH_TOKEN`. The statements below are hand-written SQL run
 * through the tagged-template wrapper in `lib/libsql.ts`; `lib/schema.ts` is
 * the declarative source of truth for the tables themselves, applied with
 * `npm run db:push`.
 *
 * Notes that apply throughout, all of them consequences of SQLite not being
 * Postgres:
 *
 *  - Timestamps are ISO-8601 **text** (see `NOW` / `ago`), which sorts and
 *    compares chronologically without a date type.
 *  - JSON lives in `text` columns, read with `json_each` / `json_extract` and
 *    merged with `json_patch`, so `fromJson` parses it on the way out.
 *  - Booleans are 0/1 integers, so reads go through `toBool`.
 *  - Where Postgres took an array parameter (`${skus}::text[]`), the array is
 *    now bound as JSON and expanded with `json_each(?)`.
 */

/**
 * Env vars that configure the database, in the order the setup docs mention
 * them. Kept as a list because several call sites report "set one of these"
 * to the operator when nothing is configured.
 */
export const CONNECTION_ENV_VARS = [TURSO_URL_ENV, TURSO_TOKEN_ENV] as const;

/** Name of the env var that supplied the connection (for diagnostics). */
export function getConnectionSource(): string | undefined {
  return getDatabaseUrl() ? TURSO_URL_ENV : undefined;
}

export function getConnectionString(): string | undefined {
  return getDatabaseUrl();
}

/** True when a Turso connection is configured. */
export function hasDatabase(): boolean {
  return hasTurso();
}

/**
 * Row of the `products` table. Every column except sku/name is optional here:
 * the table gains columns over time, and reading must not break when the
 * database has not been migrated yet (`SELECT *` simply omits them).
 *
 * `attributes` and `images` arrive as JSON **text**, and the two flags as 0/1
 * integers — SQLite has neither a JSON nor a boolean type — so `rowToProduct`
 * puts them through `fromJson` and `toBool` rather than using them directly.
 */
interface ProductRow {
  sku: string;
  name: string;
  price?: string | number | null;
  stock?: string | number | null;
  /** JSON text: an object of spec name to value. */
  attributes?: unknown;
  category?: string | null;
  brand?: string | null;
  image_url?: string | null;
  /** JSON text: an array of photo URLs, the main one first. */
  images?: unknown;
  barcode?: string | null;
  description?: string | null;
  is_promo?: number | null;
  is_bestseller?: number | null;
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

/** Longer than any real image URL; a guard against a pasted data: blob. */
const MAX_IMAGE_URL_LENGTH = 2048;

/**
 * Clean a list of photo URLs: trims, drops empties and duplicates, caps both
 * the length of a single URL and the number of photos.
 *
 * Anything that is not an array of strings collapses to `[]` — a malformed
 * JSONB value (or a hand-crafted request body) can never reach the gallery.
 */
export function sanitizeImageList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const clean = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const url = entry.trim();
    if (!url || url.length > MAX_IMAGE_URL_LENGTH) {
      continue;
    }
    clean.add(url);
    if (clean.size >= MAX_PRODUCT_IMAGES) {
      break;
    }
  }
  return [...clean];
}

function toNumber(value: string | number | null | undefined): number {
  const num = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

/**
 * A barcode reduced to its digits, stored alongside the raw value.
 *
 * The admin search matches a scanned code against this so spaces and dashes in
 * either the stored value or the query do not prevent a match. Postgres did it
 * in the query with `regexp_replace`; SQLite ships no regex function, so the
 * normalized form is computed here and written to `products.barcode_digits`.
 */
function digitsOf(value: string | null | undefined): string {
  return (value ?? "").replace(/[^0-9]/g, "");
}

/**
 * Case-folded product name, stored in `products.name_lower`.
 *
 * SQLite's `lower()` and case-insensitive `LIKE` only fold ASCII, so neither
 * helps a Cyrillic catalogue. JavaScript's `toLowerCase` is Unicode-aware, so
 * the folding happens on write and the search compares folded to folded.
 */
function foldCase(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

/**
 * Create the `products` table if it does not exist yet.
 *
 * `lib/schema.ts` is the source of truth for this shape and `npm run db:push`
 * is how it is normally applied; this mirrors it so that a request hitting an
 * empty database still self-heals instead of failing (see `loadProductsFromDb`).
 * Keep the two in step when adding a column.
 */
export async function ensureProductsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      sku            text PRIMARY KEY,
      name           text NOT NULL,
      name_lower     text NOT NULL DEFAULT '',
      price          real,
      stock          real,
      attributes     text NOT NULL DEFAULT '{}',
      category       text,
      brand          text,
      image_url      text,
      images         text NOT NULL DEFAULT '[]',
      barcode        text,
      barcode_digits text NOT NULL DEFAULT '',
      description    text,
      is_promo       integer NOT NULL DEFAULT 0,
      is_bestseller  integer NOT NULL DEFAULT 0,
      updated_at     text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      -- Stock can never go below zero. This is the guard that makes overselling
      -- impossible: two checkouts racing for the last item both try to write a
      -- negative value, SQLite rejects the second, and its whole transaction --
      -- order row included -- rolls back. SQLite can only declare a CHECK when
      -- the table is created, so unlike the Postgres version this is not added
      -- afterwards.
      CONSTRAINT products_stock_non_negative CHECK (stock >= 0)
    )
  `;
  // Barcode lookups are exact-match, so a plain index is enough.
  await sql`CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode)`;
  // The admin search scans the digits-only barcode and the case-folded name.
  await sql`CREATE INDEX IF NOT EXISTS products_barcode_digits_idx ON products (barcode_digits)`;
  await sql`CREATE INDEX IF NOT EXISTS products_name_lower_idx ON products (name_lower)`;
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
  // The gallery, with the main photo resolved from it when `image_url` is empty
  // (older rows) and the main photo never repeated inside `images`.
  const gallery = sanitizeImageList(fromJson<unknown[]>(row.images, []));
  const mainImage = storedImage || gallery[0] || LOCAL_PLACEHOLDER;
  const extraImages = gallery.filter((url) => url !== mainImage);

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
    attributes: sanitizeAttributes(fromJson<Record<string, unknown>>(row.attributes, {})),
    imageUrl: mainImage,
    // Left out entirely when there is only one photo, so the common product
    // carries no extra field through the API payload.
    ...(extraImages.length > 0 ? { images: extraImages } : {}),
    categorySlug: safeCategorySlug(storedCategory || inferCategory(name)),
    isPromo: toBool(row.is_promo),
    isBestseller: toBool(row.is_bestseller),
  };
}

/** Does this error mean the table or one of its columns is missing? */
function isMissingSchemaError(error: unknown): boolean {
  return isMissingSchema(error);
}

/**
 * Read the whole catalog from Turso.
 *
 * Uses `SELECT *` on purpose: the table gains columns over releases, and a
 * fixed column list would throw on a database that has not been migrated yet,
 * silently emptying the catalog. If the schema really is missing, the
 * migration runs once and the read is retried, so the site self-heals instead
 * of needing a manual SQL step.
 */
export async function loadProductsFromDb(): Promise<Product[]> {

  const read = async () =>
    (await sql`SELECT * FROM products ORDER BY name`) as unknown as ProductRow[];

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
  /**
   * Every photo, in the order the admin arranged them. May or may not already
   * contain `imageUrl` — `updateProductFromAdmin` merges the two.
   */
  images: string[];
  /** Empty string clears the barcode (stored as NULL). */
  barcode: string;
  /** Marketing copy. Empty string clears it (stored as NULL — see below). */
  description: string;
  attributes: Record<string, string>;
  isPromo: boolean;
  isBestseller: boolean;
}

/**
 * Longest description the admin form may store.
 *
 * Not a database limit — `text` has none — but a payload one: `/api/products`
 * ships the whole catalog, descriptions included, to every visitor's browser.
 * A pasted page of HTML in one row is paid for on every page load by everyone.
 */
export const MAX_DESCRIPTION_LENGTH = 4000;

export function sanitizeDescription(raw: unknown): string {
  return typeof raw === "string"
    ? raw.trim().slice(0, MAX_DESCRIPTION_LENGTH)
    : "";
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
  // The admin owns this field, so an empty box genuinely means "no barcode".
  const barcode = update.barcode.trim() === "" ? null : update.barcode.trim();
  // `products_stock_non_negative` would reject a negative; a negative on-hand
  // count means "none left" anyway, which is how the catalog already reads it.
  const stock = Math.max(0, update.stock);
  // One list, main photo first, deduped — and `image_url` is kept in step with
  // its first entry so the two columns can never disagree about the main photo.
  const images = sanitizeImageList([update.imageUrl, ...update.images]);
  const imageUrl = images[0] ?? update.imageUrl.trim();
  /*
   * NULL rather than '' for an empty box, and the difference is not cosmetic:
   * `description` carries three states (see `ensureProductsTable`), where ''
   * means "already looked at, nothing reliable to say" and permanently excludes
   * the row from `scripts/generate-descriptions.ts`. An admin who clears the
   * field is saying "there is no description here", not "never write one" — so
   * the row goes back to pending instead.
   */
  const description = update.description.trim() || null;

  await sql`
    INSERT INTO products (
      sku, name, name_lower, price, stock, brand, category, image_url, images,
      barcode, barcode_digits, description, attributes, is_promo, is_bestseller,
      updated_at
    )
    VALUES (
      ${update.sku},
      ${update.name},
      ${foldCase(update.name)},
      ${update.price},
      ${stock},
      ${update.brand},
      ${update.category},
      ${imageUrl},
      ${JSON.stringify(images)},
      ${barcode},
      ${digitsOf(barcode)},
      ${description},
      ${JSON.stringify(update.attributes)},
      ${update.isPromo},
      ${update.isBestseller},
      ${now()}
    )
    ON CONFLICT (sku) DO UPDATE SET
      name           = excluded.name,
      name_lower     = excluded.name_lower,
      price          = excluded.price,
      stock          = excluded.stock,
      brand          = excluded.brand,
      category       = excluded.category,
      image_url      = excluded.image_url,
      images         = excluded.images,
      barcode        = excluded.barcode,
      barcode_digits = excluded.barcode_digits,
      description    = excluded.description,
      attributes     = excluded.attributes,
      is_promo       = excluded.is_promo,
      is_bestseller  = excluded.is_bestseller,
      updated_at     = excluded.updated_at
  `;
}

/** Remove a product entirely. */
export async function deleteProductBySku(sku: string): Promise<void> {
  await sql`DELETE FROM products WHERE sku = ${sku}`;
}

/* ------------------------------- orders --------------------------------- */

/**
 * Create the `orders` table if it does not exist. Idempotent.
 *
 * Mirrors `lib/schema.ts` — see the note on `ensureProductsTable`.
 */
export async function ensureOrdersTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id              integer PRIMARY KEY AUTOINCREMENT,
      status          text NOT NULL DEFAULT 'NEW',
      -- How the order was placed: cart checkout, "Купити" or "Зарезервувати".
      type            text NOT NULL DEFAULT 'CART',
      first_name      text NOT NULL,
      last_name       text NOT NULL,
      phone           text NOT NULL,
      email           text,
      contact_channel text NOT NULL,
      city            text NOT NULL,
      warehouse       text NOT NULL,
      payment_method  text NOT NULL,
      comment         text,
      items           text NOT NULL DEFAULT '[]',
      total           real NOT NULL DEFAULT 0,
      -- Whether this order currently holds a stock reservation — the flag that
      -- makes status changes idempotent. Only a transition that actually flips
      -- it moves products.stock, so restocking twice is impossible no matter
      -- how often "Скасувати" is pressed.
      stock_applied   integer NOT NULL DEFAULT 0,
      -- Salted hash of the submitter's IP — never a real address — purely so
      -- countRecentOrdersByIp can throttle a script that floods orders to
      -- drain stock or spam the seller's Telegram/email.
      ip_hash         text NOT NULL DEFAULT '',
      -- Orders placed while signed in are owned outright; older ones are
      -- matched by phone/email at read time (see listOrdersForCustomer).
      customer_id     integer REFERENCES customers(id) ON DELETE SET NULL,
      created_at      text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS orders_ip_hash_created_idx ON orders (ip_hash, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders (customer_id)`;
  // "Купують разом" scans baskets by status before unpacking their JSON.
  await sql`CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status)`;
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
  /** JSON text: the basket lines. */
  items: unknown;
  total: string | number | null;
  created_at: string | Date;
  stock_applied?: number | null;
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
    items: fromJson<OrderItem[]>(row.items, []),
    total: toNumber(row.total),
    // Stored as ISO-8601 text already, so no conversion is needed.
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
 * libSQL does have interactive transactions, so unlike the Neon HTTP driver it
 * can read and then decide what to write inside one. That matters here: SQLite
 * has no data-modifying CTE (`WITH x AS (UPDATE … RETURNING)`), which is how
 * the Postgres version claimed the reservation flag and moved stock in a single
 * statement. `sql.begin()` replaces those with a read and a write in one
 * transaction, which is atomic for the same reason.
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

/** Did SQLite reject this write because it would oversell? */
function isStockConstraintError(error: unknown): boolean {
  return isCheckViolation(error, "products_stock_non_negative");
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
  // Postgres took two parallel arrays through `UNNEST(…::text[], …::numeric[])`.
  // SQLite has no array type, so the lines travel as one JSON array of objects
  // and `json_each` unpacks them into rows.
  const rows = (await sql`
    SELECT
      json_extract(t.value, '$.sku')      AS sku,
      COALESCE(p.name, '')                AS name,
      COALESCE(p.stock, 0)                AS available,
      json_extract(t.value, '$.quantity') AS required
    FROM ${jsonRows(lines)} AS t
    LEFT JOIN products p ON p.sku = json_extract(t.value, '$.sku')
    WHERE p.sku IS NULL
       OR COALESCE(p.stock, 0) < json_extract(t.value, '$.quantity')
  `) as unknown as {
    sku: string;
    name: string;
    available: number;
    required: number;
  }[];

  return rows.map((row) => ({
    sku: row.sku,
    name: row.name,
    available: Math.max(0, toNumber(row.available)),
    required: toNumber(row.required),
  }));
}

/**
 * Insert a new order and reserve its quantities, both or neither.
 *
 * `ipHash` is bookkeeping only — a salted digest, never stored anywhere else
 * on the order, never returned by `rowToOrder` — used solely so
 * `countRecentOrdersByIp` can throttle a flood of orders from one caller.
 */
export async function createOrder(
  input: OrderInput,
  ipHash = "",
): Promise<Order> {
  const lines = toStockLines(input.items);

  const insert = () => sql`
    INSERT INTO orders (
      status, type, first_name, last_name, phone, email, contact_channel,
      city, warehouse, payment_method, comment, items, total, stock_applied,
      ip_hash
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
      ${JSON.stringify(input.items)},
      ${input.total},
      ${lines.length > 0},
      ${ipHash}
    )
    RETURNING *
  `;

  const run = async (): Promise<OrderRow[]> => {
    if (lines.length === 0) {
      // Nothing maps to a catalog row, so there is no stock to move.
      return (await insert()) as unknown as OrderRow[];
    }
    // Both statements or neither: if the deduction trips the non-negative
    // CHECK, the insert rolls back with it and no order is recorded.
    const [, inserted] = await sql.transaction([
      stockMove(lines, -1),
      insert(),
    ]);
    return inserted as unknown as OrderRow[];
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
 * How many orders this IP has submitted recently, across the cart checkout,
 * "Купити" and "Зарезервувати" alike — they all end up here via `createOrder`.
 * Every status counts, cancelled included: a script flooding orders to drain
 * stock or spam notifications still used up its budget even if an admin later
 * cancels the mess.
 */
export async function countRecentOrdersByIp(
  ipHash: string,
  withinMinutes: number,
): Promise<number> {
  const run = async () =>
    (await sql`
      SELECT count(*) AS n
      FROM orders
      WHERE ip_hash = ${ipHash}
        AND ip_hash <> ''
        AND created_at > ${ago(`-${Math.max(0, Math.floor(withinMinutes))} minutes`)}
    `) as unknown as { n: number }[];

  try {
    return (await run())[0]?.n ?? 0;
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureOrdersTable();
    return 0;
  }
}

/**
 * One statement that adds `sign × quantity` to each product's stock.
 * `sign` is -1 to reserve stock for an order and +1 to release it.
 */
function stockMove(lines: StockLine[], sign: -1 | 1): SqlQuery {
  const deltas = lines.map((line) => ({
    sku: line.sku,
    delta: line.quantity * sign,
  }));
  return sql`
    UPDATE products
    SET stock      = COALESCE(stock, 0) + (
          SELECT json_extract(t.value, '$.delta')
          FROM ${jsonRows(deltas)} AS t
          WHERE json_extract(t.value, '$.sku') = products.sku
        ),
        updated_at = ${now()}
    WHERE sku IN (
      SELECT json_extract(t.value, '$.sku') FROM ${jsonRows(deltas)} AS t
    )
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
  const shouldHold = reservesStock(status);

  /**
   * Read the order, then claim the flag and move stock — all in one
   * transaction.
   *
   * The Postgres version did this with a data-modifying CTE, which SQLite has
   * no equivalent for. An interactive transaction expresses the same thing:
   * `UPDATE … WHERE stock_applied = <what we read>` is the optimistic lock, so
   * a second concurrent (or repeated) cancellation updates no row, and the
   * stock move is skipped along with it. Nothing outside the transaction can
   * observe a half-applied change.
   */
  const run = async (): Promise<{ rows: OrderRow[]; applied: StockEffect }> =>
    sql.begin(async (tx) => {
      const current = (await tx`
        SELECT items, COALESCE(stock_applied, 0) AS stock_applied
        FROM orders
        WHERE id = ${id}
      `) as unknown as { items: unknown; stock_applied: number }[];

      const row = current[0];
      if (!row) {
        throw new OrderNotFoundError(id);
      }

      const holdsNow = toBool(row.stock_applied);
      const parsed = fromJson<unknown>(row.items, []);
      const items = Array.isArray(parsed) ? (parsed as OrderItem[]) : [];
      const lines = toStockLines(items);
      const effect: StockEffect =
        shouldHold === holdsNow || lines.length === 0
          ? "unchanged"
          : shouldHold
            ? "reserved"
            : "released";

      let applied: StockEffect = "unchanged";

      if (effect !== "unchanged") {
        const claimed = (await tx`
          UPDATE orders
          SET stock_applied = ${shouldHold}
          WHERE id = ${id} AND COALESCE(stock_applied, 0) = ${holdsNow}
          RETURNING id
        `) as unknown as { id: number }[];

        // Losing the claim means another request already made this move — the
        // status still applies, but reporting a stock change would be a lie.
        if (claimed.length > 0) {
          const deltas = lines.map((line) => ({
            sku: line.sku,
            delta: line.quantity * (shouldHold ? -1 : 1),
          }));
          await tx`
            UPDATE products
            SET stock      = COALESCE(stock, 0) + (
                  SELECT json_extract(t.value, '$.delta')
                  FROM json_each(${JSON.stringify(deltas)}) AS t
                  WHERE json_extract(t.value, '$.sku') = products.sku
                ),
                updated_at = ${now()}
            WHERE sku IN (
              SELECT json_extract(t.value, '$.sku')
              FROM json_each(${JSON.stringify(deltas)}) AS t
            )
          `;
          applied = effect;
        }
      }

      const updated = (await tx`
        UPDATE orders SET status = ${status} WHERE id = ${id} RETURNING *
      `) as unknown as OrderRow[];

      return { rows: updated, applied };
    });

  let result: { rows: OrderRow[]; applied: StockEffect };
  try {
    result = await run();
  } catch (caught) {
    if (isStockConstraintError(caught)) {
      // Nothing was written: the status change rolled back with the deduction.
      const items = await readOrderItems(id);
      throw new InsufficientStockError(await findStockShortages(items));
    }
    if (caught instanceof OrderNotFoundError) throw caught;
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureOrdersTable();
    result = await run();
  }

  if (!result.rows[0]) {
    throw new OrderNotFoundError(id);
  }
  return { order: rowToOrder(result.rows[0]), stock: result.applied };
}

/**
 * An order's basket, read on its own.
 *
 * Only used to explain an oversell after the transaction that would have
 * reported it has already rolled back.
 */
async function readOrderItems(id: number): Promise<OrderItem[]> {
  try {
    const rows = (await sql`
      SELECT items FROM orders WHERE id = ${id}
    `) as unknown as { items: unknown }[];
    const parsed = fromJson<unknown>(rows[0]?.items, []);
    return Array.isArray(parsed) ? (parsed as OrderItem[]) : [];
  } catch {
    return [];
  }
}

/** Most recent orders first. */
export async function listOrders(limit = 50): Promise<Order[]> {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200);
  const run = async () =>
    (await sql`
      SELECT * FROM orders ORDER BY created_at DESC LIMIT ${safeLimit}
    `) as unknown as OrderRow[];

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
 * Paged admin catalog search, executed in the database.
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
  filters = {},
}: {
  query: string;
  limit?: number;
  offset?: number;
  /** Sidebar filters. Combine with the query rather than replacing it. */
  filters?: AdminProductFilters;
}): Promise<AdminSearchResult> {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);
  const safeOffset = Math.max(0, Math.floor(offset));
  const trimmed = query.trim();
  const filtered = hasAdminFilters(filters);

  const run = async (): Promise<AdminSearchResult> => {
    if (!trimmed && !filtered) {
      // Nothing selected: the cheap path, most recently touched first. Keeps
      // the common case off the derived-column subqueries entirely.
      const rows = (await sql`
        SELECT * FROM products
        ORDER BY updated_at DESC NULLS LAST, name
        LIMIT ${safeLimit} OFFSET ${safeOffset}
      `) as unknown as ProductRow[];
      const countRows = (await sql`
        SELECT COUNT(*) AS total FROM products
      `) as unknown as { total: number }[];
      return {
        products: rows.filter((r) => r.sku).map(rowToProduct),
        total: countRows[0]?.total ?? 0,
      };
    }

    /*
     * Postgres matched with `ILIKE`, which folds case for any alphabet.
     * SQLite's `LIKE` folds ASCII only, so a Cyrillic query would match
     * nothing — the search compares the folded query against the stored
     * `name_lower` instead, and folds the other columns with `lower()` since
     * SKUs, brands and barcodes are ASCII.
     */
    const foldedPattern = trimmed ? `%${escapeLike(foldCase(trimmed))}%` : null;
    // Digits-only variant so a scanned barcode with spaces/dashes still
    // matches; `barcode_digits` is the stored counterpart, maintained on write
    // because SQLite has no `regexp_replace`.
    const digits = digitsOf(trimmed);
    const digitPattern = digits ? `%${digits}%` : null;

    // A factory, not a shared value: each query gets its own fragment so the
    // two statements never share one lazy query object.
    const whereClause = () => sql`
      (
        ${foldedPattern} IS NULL
        OR p.name_lower LIKE ${foldedPattern} ESCAPE '\\'
        OR lower(p.sku) LIKE ${foldedPattern} ESCAPE '\\'
        OR lower(COALESCE(p.brand, '')) LIKE ${foldedPattern} ESCAPE '\\'
        OR lower(COALESCE(p.barcode, '')) LIKE ${foldedPattern} ESCAPE '\\'
        OR (${digitPattern} IS NOT NULL
            AND p.barcode_digits <> ''
            AND p.barcode_digits LIKE ${digitPattern})
      )
      AND ${filterClause(filters)}
    `;

    const rows = (await sql`
      SELECT * FROM ${derivedProducts()}
      WHERE ${whereClause()}
      ORDER BY p.updated_at DESC NULLS LAST, p.name
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `) as unknown as ProductRow[];
    const countRows = (await sql`
      SELECT COUNT(*) AS total
      FROM ${derivedProducts()}
      WHERE ${whereClause()}
    `) as unknown as { total: number }[];

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

/** SQLite rejects two updates of the same key in one statement — dedupe first. */
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
 * refreshes `updated_at`. Uses one statement per chunk (the whole chunk travels
 * as a single JSON parameter) rather than one round trip per item — important
 * over a network-attached database.
 *
 * Only the columns УкрСклад owns are written. The admin-owned ones — brand,
 * category, image_url, images, attributes, description and the two badges —
 * are left untouched, so they survive every synchronization.
 *
 * @returns how many rows were inserted or updated
 */
export async function upsertProducts(items: ImportItem[]): Promise<number> {
  const unique = dedupeBySku(items);
  if (unique.length === 0) {
    return 0;
  }

  let affected = 0;

  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE).map((item) => {
      // Empty string -> NULL so "no barcode" is stored as NULL, not "".
      const barcode = (item.barcode ?? "").trim() || null;
      return {
        sku: item.sku,
        name: item.name,
        name_lower: foldCase(item.name),
        price: item.price,
        // Clamped for `products_stock_non_negative`: УкрСклад can report a
        // negative on-hand balance, and one such row must not abort the chunk.
        stock: Math.max(0, item.stock),
        barcode,
        barcode_digits: digitsOf(barcode),
      };
    });

    await sql`
      INSERT INTO products (
        sku, name, name_lower, price, stock, barcode, barcode_digits, updated_at
      )
      SELECT
        json_extract(t.value, '$.sku'),
        json_extract(t.value, '$.name'),
        json_extract(t.value, '$.name_lower'),
        json_extract(t.value, '$.price'),
        json_extract(t.value, '$.stock'),
        json_extract(t.value, '$.barcode'),
        json_extract(t.value, '$.barcode_digits'),
        ${now()}
      FROM ${jsonRows(chunk)} AS t
      -- SQLite cannot tell this ON CONFLICT from a join's ON clause unless the
      -- SELECT carries a WHERE, so the no-op one below is load-bearing.
      WHERE true
      ON CONFLICT (sku) DO UPDATE SET
        name           = excluded.name,
        name_lower     = excluded.name_lower,
        price          = excluded.price,
        stock          = excluded.stock,
        -- Keep a previously stored barcode when this import omits one,
        -- so a feed without barcodes does not wipe existing values.
        barcode        = COALESCE(excluded.barcode, products.barcode),
        barcode_digits = CASE
                           WHEN excluded.barcode IS NULL THEN products.barcode_digits
                           ELSE excluded.barcode_digits
                         END,
        updated_at     = excluded.updated_at
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

  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 20);

  try {
    /*
     * Postgres matched baskets with the JSONB containment operator
     * (`items @> '[{"sku": …}]'`) and unpacked them with
     * `LATERAL jsonb_array_elements`. SQLite has neither, so both halves are
     * `json_each`: an EXISTS subquery to find the baskets, and a join to read
     * every line out of them.
     */
    const rows = (await sql`
      WITH baskets AS (
        SELECT id, items
        FROM orders
        WHERE status <> 'CANCELLED'
          AND EXISTS (
            SELECT 1 FROM json_each(orders.items) AS probe
            WHERE json_extract(probe.value, '$.sku') = ${sku}
          )
      )
      SELECT json_extract(item.value, '$.sku') AS sku,
             COUNT(DISTINCT b.id)              AS orders
      FROM baskets b, json_each(b.items) AS item
      WHERE COALESCE(json_extract(item.value, '$.sku'), '') <> ''
        AND json_extract(item.value, '$.sku') <> ${sku}
      GROUP BY sku
      ORDER BY orders DESC, sku
      LIMIT ${safeLimit}
    `) as unknown as { sku: string; orders: number }[];

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
  await sql`
    CREATE TABLE IF NOT EXISTS store_settings (
      key        text PRIMARY KEY,
      value      text NOT NULL,
      updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `;
}

/** Raw read. Returns the defaults when the table or the database is missing. */
async function readStoreSettings(): Promise<StoreSettings> {
  if (!hasDatabase()) {
    return DEFAULT_STORE_SETTINGS;
  }

  const run = async () =>
    (await sql`SELECT key, value FROM store_settings`) as unknown as {
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
  const pairs = Object.keys(values).map((key) => ({
    key,
    value: values[key as keyof StoreSettings],
  }));

  const run = async () => {
    await sql`
      INSERT INTO store_settings (key, value, updated_at)
      SELECT json_extract(t.value, '$.key'),
             json_extract(t.value, '$.value'),
             ${now()}
      FROM ${jsonRows(pairs)} AS t
      WHERE true
      ON CONFLICT (key) DO UPDATE SET
        value      = excluded.value,
        updated_at = excluded.updated_at
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
  await sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id          integer PRIMARY KEY AUTOINCREMENT,
      product_sku text NOT NULL,
      author_name text NOT NULL,
      rating      integer NOT NULL,
      body        text NOT NULL,
      status      text NOT NULL DEFAULT 'PENDING',
      ip_hash     text NOT NULL DEFAULT '',
      created_at  text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
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
  const rows = (await sql`
    SELECT count(*) AS n
    FROM reviews
    WHERE ip_hash = ${ipHash}
      AND ip_hash <> ''
      AND created_at > ${ago(`-${Math.max(0, Math.floor(withinHours))} hours`)}
  `) as unknown as { n: number }[];
  return rows[0]?.n ?? 0;
}

/** Has this visitor already reviewed this product inside the window? */
export async function hasRecentReviewForProduct(
  ipHash: string,
  productSku: string,
  withinHours: number,
): Promise<boolean> {
  const rows = (await sql`
    SELECT 1
    FROM reviews
    WHERE ip_hash = ${ipHash}
      AND ip_hash <> ''
      AND product_sku = ${productSku}
      AND created_at > ${ago(`-${Math.max(0, Math.floor(withinHours))} hours`)}
    LIMIT 1
  `) as unknown[];
  return rows.length > 0;
}

/** Store a new review. Always lands in `PENDING`. */
export async function createReview(input: ReviewInput): Promise<Review> {
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
    `) as unknown as ReviewRow[];

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
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200);
  try {
    const rows = (await sql`
      SELECT * FROM reviews
      WHERE product_sku = ${productSku} AND status = 'APPROVED'
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `) as unknown as ReviewRow[];
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
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 500);
  try {
    const rows = (await sql`
      SELECT r.*, p.name AS product_name
      FROM reviews r
      LEFT JOIN products p ON p.sku = r.product_sku
      ORDER BY r.created_at DESC
      LIMIT ${safeLimit}
    `) as unknown as ReviewRow[];
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
  const rows = (await sql`
    UPDATE reviews SET status = ${status} WHERE id = ${id} RETURNING *
  `) as unknown as ReviewRow[];
  if (rows.length === 0) {
    throw new ReviewNotFoundError(id);
  }
  return rowToReview(rows[0]);
}

export async function deleteReview(id: number): Promise<void> {
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
    const rows = (await sql`
      SELECT product_sku, avg(rating) AS average, count(*) AS count
      FROM reviews
      WHERE status = 'APPROVED'
      GROUP BY product_sku
    `) as unknown as { product_sku: string; average: number; count: number }[];

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

/**
 * Create the `customers`, `favorites` and `password_resets` tables if absent.
 * Idempotent. Mirrors `lib/schema.ts` — see the note on `ensureProductsTable`.
 */
export async function ensureCustomersTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS customers (
      id            integer PRIMARY KEY AUTOINCREMENT,
      email         text NOT NULL,
      password_hash text NOT NULL,
      name          text NOT NULL DEFAULT '',
      phone         text NOT NULL DEFAULT '',
      -- Session generation. The customer's cookie carries the number it was
      -- signed with; bumping it invalidates every session that customer has
      -- anywhere, which is the whole point of changing a password after a
      -- break-in. Starts at 1 rather than 0 so an absent/legacy value in a
      -- token is distinguishable.
      session_epoch integer NOT NULL DEFAULT 1,
      created_at    text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `;
  // Email is the login, so uniqueness is enforced by the database rather than
  // by a read-then-write in the action, which two concurrent signups could
  // race. Addresses are ASCII, so SQLite's ASCII-only `lower()` suffices.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS customers_email_key
    ON customers (lower(email))
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS favorites (
      customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      product_sku text NOT NULL,
      created_at  text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (customer_id, product_sku)
    )
  `;
  // Password reset tickets. `token_hash` is a SHA-256 of the value that went
  // out by email and is the primary key: the raw token exists only in that one
  // message, so a leak of this table hands an attacker nothing usable — the
  // same reasoning as storing password hashes rather than passwords.
  await sql`
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash  text PRIMARY KEY,
      customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      expires_at  text NOT NULL,
      used_at     text,
      created_at  text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `;
  // Every lookup is by token; this index is for the sweep of dead rows.
  await sql`
    CREATE INDEX IF NOT EXISTS password_resets_expires_idx
    ON password_resets (expires_at)
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
  /** Absent on a database that has not run the `ALTER TABLE` above yet. */
  session_epoch?: number | null;
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
    // A row from before the column existed reads as generation 1, the same
    // value a fresh row gets — so no existing session is invalidated by the
    // migration itself.
    sessionEpoch: Number(row.session_epoch ?? 1) || 1,
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
  return isLibsqlUniqueViolation(error);
}

export async function createCustomer(input: {
  email: string;
  passwordHash: string;
  name: string;
  phone: string;
}): Promise<CustomerWithSecret> {
  const run = async () =>
    (await sql`
      INSERT INTO customers (email, password_hash, name, phone)
      VALUES (${input.email}, ${input.passwordHash}, ${input.name}, ${input.phone})
      RETURNING *
    `) as unknown as CustomerRow[];

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
  try {
    const rows = (await sql`
      SELECT * FROM customers WHERE lower(email) = lower(${email}) LIMIT 1
    `) as unknown as CustomerRow[];
    return rows.length > 0 ? rowToCustomer(rows[0]) : null;
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureCustomersTable();
    return null;
  }
}

export async function findCustomerById(id: number): Promise<Customer | null> {
  try {
    const rows = (await sql`
      SELECT * FROM customers WHERE id = ${id} LIMIT 1
    `) as unknown as CustomerRow[];
    if (rows.length === 0) return null;
    const full = rowToCustomer(rows[0]);
    // The hash never leaves this module for a read-only lookup.
    return {
      id: full.id,
      email: full.email,
      name: full.name,
      phone: full.phone,
      createdAt: full.createdAt,
      sessionEpoch: full.sessionEpoch,
    };
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureCustomersTable();
    return null;
  }
}

/**
 * Like `findCustomerById`, but keeps the password hash.
 *
 * Separate from the plain lookup on purpose: the hash is needed in exactly one
 * place — re-checking the current password before changing it — and everything
 * else has no business holding it.
 */
export async function findCustomerSecretById(
  id: number,
): Promise<CustomerWithSecret | null> {
  try {
    const rows = (await sql`
      SELECT * FROM customers WHERE id = ${id} LIMIT 1
    `) as unknown as CustomerRow[];
    return rows.length > 0 ? rowToCustomer(rows[0]) : null;
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

/**
 * The generation a customer's sessions must carry to still count, or `null`
 * when the account is gone.
 *
 * One tiny primary-key lookup, called once per request via the React `cache` in
 * `lib/customer-session.ts`. It is what turns a stateless cookie into something
 * that can be revoked: without it, a password change cannot reach a token
 * already sitting in an attacker's browser.
 */
export async function getCustomerSessionEpoch(
  id: number,
): Promise<number | null> {
  try {
    const rows = (await sql`
      SELECT session_epoch FROM customers WHERE id = ${id} LIMIT 1
    `) as { session_epoch: number | null }[];
    if (rows.length === 0) {
      return null;
    }
    return Number(rows[0].session_epoch ?? 1) || 1;
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    // Table (or column) not migrated yet — no session has been invalidated.
    await ensureCustomersTable();
    return 1;
  }
}

/**
 * Set a new password for a signed-in customer and retire every session that
 * was issued under the old one.
 *
 * Returns the new session generation, which the caller signs into a fresh
 * cookie for the browser doing the change — so the person changing their
 * password stays signed in, and every other device does not.
 */
export async function changeCustomerPassword(
  id: number,
  passwordHash: string,
): Promise<number | null> {
  const rows = (await sql`
    UPDATE customers
    SET password_hash = ${passwordHash},
        session_epoch = session_epoch + 1
    WHERE id = ${id}
    RETURNING session_epoch
  `) as { session_epoch: number }[];

  if (rows.length === 0) {
    return null;
  }
  // Any reset link that was in flight is void now: the password it was going
  // to change has already changed.
  await sql`DELETE FROM password_resets WHERE customer_id = ${id}`;
  return Number(rows[0].session_epoch) || 1;
}

/* --------------------------- password resets ------------------------------ */

/**
 * Issue a reset ticket for `customerId`, valid until `expiresAt`.
 *
 * Any ticket that customer already had is dropped first, so a stack of old
 * emails cannot each open the account — the most recent request is the only
 * one that works. Also sweeps expired rows for everybody: this path runs rarely
 * enough that the extra statement costs nothing, and it saves a cron job.
 */
export async function createPasswordReset(
  customerId: number,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await sql`DELETE FROM password_resets WHERE customer_id = ${customerId}`;
  await sql`DELETE FROM password_resets WHERE expires_at < ${now()}`;
  await sql`
    INSERT INTO password_resets (token_hash, customer_id, expires_at)
    VALUES (${tokenHash}, ${customerId}, ${expiresAt.toISOString()})
  `;
}

/**
 * The customer a live reset token belongs to, or `null`.
 *
 * "Live" means: exists, not past its expiry, and not already used. Every
 * failure mode collapses to `null` on purpose — the page it feeds must not be
 * able to tell an expired ticket from a forged one.
 */
export async function findPasswordReset(
  tokenHash: string,
): Promise<number | null> {
  try {
    const rows = (await sql`
      SELECT customer_id
      FROM password_resets
      WHERE token_hash = ${tokenHash}
        AND used_at IS NULL
        AND expires_at > ${now()}
      LIMIT 1
    `) as unknown as { customer_id: number }[];
    return rows[0]?.customer_id ?? null;
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureCustomersTable();
    return null;
  }
}

/**
 * Set a new password and burn the ticket, both or neither.
 *
 * The `used_at IS NULL` guard inside the transaction is what makes a token
 * single-use even if two requests arrive at once: the second one updates no
 * row, sees a zero count and is rejected.
 *
 * Returns the customer whose password was changed, or `null` if the ticket was
 * not usable.
 */
export interface ConsumedReset {
  id: number;
  email: string;
  /** Generation the new session must be signed with (every older one dies). */
  sessionEpoch: number;
}

export async function consumePasswordReset(
  tokenHash: string,
  passwordHash: string,
): Promise<ConsumedReset | null> {
  /*
   * Claim the ticket and change the password in one transaction.
   *
   * Postgres did this with a data-modifying CTE so the UPDATE could only ever
   * run for a ticket that was actually claimed. SQLite has no such CTE, so the
   * claim and the password change are two statements inside one transaction —
   * which gives the same guarantee: the `used_at IS NULL` guard means a second
   * concurrent request claims no row, and the password change is skipped along
   * with it.
   *
   * `session_epoch + 1` belongs here for the same reason the ticket is burned
   * here: a reset is how someone recovers a *stolen* account, and it would be
   * worth little if the thief's existing cookie kept working.
   */
  return sql.begin(async (tx) => {
    const claimed = (await tx`
      UPDATE password_resets
      SET used_at = ${now()}
      WHERE token_hash = ${tokenHash}
        AND used_at IS NULL
        AND expires_at > ${now()}
      RETURNING customer_id
    `) as unknown as { customer_id: number }[];

    const customerId = claimed[0]?.customer_id;
    if (customerId === undefined || customerId === null) {
      return null;
    }

    const rows = (await tx`
      UPDATE customers
      SET password_hash = ${passwordHash},
          session_epoch = session_epoch + 1
      WHERE id = ${customerId}
      RETURNING id, email, session_epoch
    `) as unknown as { id: number; email: string; session_epoch: number }[];

    const row = rows[0];
    return row
      ? {
          id: row.id,
          email: row.email ?? "",
          sessionEpoch: Number(row.session_epoch) || 1,
        }
      : null;
  });
}

/* ------------------------------ favorites -------------------------------- */

export async function listFavorites(customerId: number): Promise<string[]> {
  try {
    const rows = (await sql`
      SELECT product_sku FROM favorites
      WHERE customer_id = ${customerId}
      ORDER BY created_at DESC
    `) as unknown as { product_sku: string }[];
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

  const run = async () => {
    await sql`
      INSERT INTO favorites (customer_id, product_sku)
      SELECT ${customerId}, t.value FROM ${jsonRows(unique)} AS t
      WHERE true
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
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200);
  try {
    /*
     * Orders this account owns outright, plus the guest orders it can prove
     * are its own.
     *
     * That second half used to match on email OR phone, either alone — which
     * made an order's contact details its password. Nothing verifies an
     * address at signup, so registering as someone@else.com was enough to read
     * their name, phone, delivery branch and everything they had bought; the
     * phone half was worse, because a checkout writes the phone straight onto
     * the profile (`updateCustomerContact`).
     *
     * Both must match now, and only for orders nobody owns yet: an order
     * already claimed by another account is never shown here regardless. This
     * is a narrowing, not a cure — an attacker who knows both the email and
     * the phone still matches. Verifying the address at signup is what would
     * actually settle it; see README, "Чого ще немає".
     */
    const rows = (await sql`
      SELECT * FROM orders
      WHERE customer_id = ${customerId}
         OR (
              customer_id IS NULL
              AND ${email} <> '' AND lower(email) = lower(${email})
              AND ${phone} <> '' AND phone = ${phone}
            )
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `) as unknown as OrderRow[];
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
    `) as unknown as GenerationCandidate[];

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
  const run = async () =>
    (await sql`
      SELECT
        count(*) FILTER (WHERE description IS NULL) AS pending,
        count(*) FILTER (WHERE description <> '')   AS described,
        count(*) FILTER (WHERE description = '')    AS unknown
      FROM products
    `) as unknown as { pending: number; described: number; unknown: number }[];

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
  const text = (description ?? "").trim();
  const clean = sanitizeAttributes(attributes);

  await sql`
    UPDATE products
    SET description = ${text},
        -- json_patch(generated, existing) is the SQLite spelling of the
        -- Postgres generated || existing: keys present in both keep the
        -- existing value, so an admin-entered attribute always wins.
        attributes  = json_patch(${JSON.stringify(clean)}, COALESCE(attributes, '{}')),
        updated_at  = ${now()}
    WHERE sku = ${sku}
  `;
}

/* --------------------- admin catalog filters (derived) -------------------- */

/**
 * Brand and category are not reliably stored: the catalogue's `category`
 * column is empty for every row and most `brand` values are recovered from the
 * product name at read time by `rowToProduct`. Filtering on the raw columns
 * would therefore match almost nothing, so the same inference is rebuilt here
 * in SQL and the admin filters run against *that*.
 *
 * Both expressions are built from the very constants `detectBrand` and
 * `inferCategory` use, passed as parameters — the array order carries the
 * precedence, so the two implementations cannot drift apart.
 *
 * Two Postgres features this needed are absent from SQLite, and the
 * replacements are worth knowing:
 *
 *  - `LATERAL … WITH ORDINALITY` becomes a correlated scalar subquery over
 *    `json_each`, whose `key` column *is* the array index — so ordering by it
 *    still reproduces `Array.prototype.find()`, where the earliest entry wins.
 *  - `p.name ~* pattern` has no equivalent: SQLite ships no regex. The
 *    `CATEGORY_RULES` patterns are plain `a|b|c` alternations of literals, so
 *    each one is split on `|` and matched with `LIKE '%…%'` against the
 *    case-folded `name_lower` column, which is exactly what the regex did.
 */
function derivedProducts() {
  const countries = [...COUNTRY_VALUES];
  const knownSlugs = [...KNOWN_SLUGS];
  // Brand matching is case-insensitive in `detectBrand`, and `name_lower` is
  // already folded, so the needles are folded to match.
  const brands = [...KNOWN_BRANDS].map((brand) => ({
    brand,
    needle: brand.toLowerCase(),
  }));
  // One row per (rule, alternative), keeping the rule's position so the first
  // rule in CATEGORY_RULES still wins however many alternatives it has.
  const categoryNeedles = CATEGORY_RULES.flatMap((rule, order) =>
    rule.pattern
      .split("|")
      .map((needle) => needle.trim())
      .filter(Boolean)
      .map((needle) => ({ slug: rule.slug, needle, ord: order })),
  );

  return sql`(
    SELECT
      p.*,
      -- detectBrand(): an explicit brand wins unless it is really a country;
      -- otherwise the first KNOWN_BRANDS entry appearing in the name.
      CASE
        WHEN COALESCE(p.brand, '') <> ''
             AND lower(p.brand) NOT IN (SELECT value FROM ${jsonRows(countries)})
        THEN p.brand
        ELSE COALESCE((
          SELECT json_extract(b.value, '$.brand')
          FROM ${jsonRows(brands)} AS b
          WHERE p.name_lower LIKE '%' || json_extract(b.value, '$.needle') || '%'
          ORDER BY b.key
          LIMIT 1
        ), '')
      END AS eff_brand,
      -- safeCategorySlug(stored || inferCategory()).
      CASE
        WHEN COALESCE(p.category, '') <> '' THEN
          CASE WHEN p.category IN (SELECT value FROM ${jsonRows(knownSlugs)})
               THEN p.category ELSE ${CATEGORY_FALLBACK} END
        ELSE COALESCE((
          SELECT json_extract(c.value, '$.slug')
          FROM ${jsonRows(categoryNeedles)} AS c
          WHERE p.name_lower LIKE '%' || json_extract(c.value, '$.needle') || '%'
          ORDER BY json_extract(c.value, '$.ord'), c.key
          LIMIT 1
        ), ${CATEGORY_FALLBACK})
      END AS eff_category
    FROM products p
  ) p`;
}

export interface AdminProductFilters {
  /** Effective brand, as shown in the catalogue. */
  brands?: string[];
  /** Effective category slug. */
  categories?: string[];
  /** `"in"` = stock > 0, `"out"` = stock 0 or unset. */
  availability?: "in" | "out" | null;
  /** `"promo"` / `"bestseller"` — OR-ed, like the storefront badge filter. */
  badges?: string[];
  /** `"description"` / `"attributes"` / `"image"` — OR-ed. */
  missing?: string[];
}

/** `null` for an empty selection, so the SQL treats it as "no constraint". */
function orNull(values: string[] | undefined): string[] | null {
  const clean = (values ?? []).map((v) => v.trim()).filter(Boolean);
  return clean.length > 0 ? clean : null;
}

/** Are any filters actually set? Used to pick the cheap unfiltered path. */
export function hasAdminFilters(filters: AdminProductFilters): boolean {
  return Boolean(
    orNull(filters.brands) ||
      orNull(filters.categories) ||
      orNull(filters.badges) ||
      orNull(filters.missing) ||
      (filters.availability === "in" || filters.availability === "out"),
  );
}

/**
 * One WHERE fragment covering every filter.
 *
 * Each clause short-circuits on a NULL parameter, so an unset filter costs
 * nothing and there is no string concatenation anywhere — every value is a
 * bound parameter. The Postgres `= ANY(${array}::text[])` becomes
 * `IN (SELECT value FROM json_each(?))`, the array travelling as JSON.
 */
function filterClause(filters: AdminProductFilters) {
  const brands = orNull(filters.brands);
  const categories = orNull(filters.categories);
  const badges = orNull(filters.badges);
  const missing = orNull(filters.missing);
  const availability =
    filters.availability === "in" || filters.availability === "out"
      ? filters.availability
      : null;

  // `json_each` needs a JSON document, so an unset filter is passed as NULL
  // and guarded by the `IS NULL` half of each clause rather than expanded.
  const brandsJson = brands ? JSON.stringify(brands) : null;
  const categoriesJson = categories ? JSON.stringify(categories) : null;
  const badgesJson = badges ? JSON.stringify(badges) : null;
  const missingJson = missing ? JSON.stringify(missing) : null;

  return sql`
    (${brandsJson} IS NULL
     OR p.eff_brand IN (SELECT value FROM json_each(${brandsJson})))
    AND (${categoriesJson} IS NULL
     OR p.eff_category IN (SELECT value FROM json_each(${categoriesJson})))
    AND (
      ${availability} IS NULL
      OR (${availability} = 'in'  AND COALESCE(p.stock, 0) >  0)
      OR (${availability} = 'out' AND COALESCE(p.stock, 0) <= 0)
    )
    AND (
      ${badgesJson} IS NULL
      OR ('promo' IN (SELECT value FROM json_each(${badgesJson}))
          AND p.is_promo = 1)
      OR ('bestseller' IN (SELECT value FROM json_each(${badgesJson}))
          AND p.is_bestseller = 1)
    )
    AND (
      ${missingJson} IS NULL
      OR ('description' IN (SELECT value FROM json_each(${missingJson}))
          AND COALESCE(p.description, '') = '')
      OR ('attributes' IN (SELECT value FROM json_each(${missingJson}))
          AND COALESCE(p.attributes, '{}') IN ('{}', ''))
      OR ('image' IN (SELECT value FROM json_each(${missingJson}))
          AND COALESCE(p.image_url, '') IN ('', ${LOCAL_PLACEHOLDER}))
    )
  `;
}

export interface AdminFacet {
  value: string;
  count: number;
}

export interface AdminFacets {
  brands: AdminFacet[];
  categories: AdminFacet[];
  availability: { in: number; out: number };
  missing: { description: number; attributes: number; image: number };
}

/**
 * Counts for the admin filter sidebar, so it only ever offers values that
 * actually match something and can show how many.
 *
 * Deliberately a separate endpoint from the search: the search re-runs on
 * every keystroke, while these totals only change after an edit or import.
 */
export async function loadAdminFacets(): Promise<AdminFacets> {

  const run = async (): Promise<AdminFacets> => {
    const [brandRows, categoryRows, totalRows] = await Promise.all([
      sql`
        SELECT p.eff_brand AS value, COUNT(*) AS count
        FROM ${derivedProducts()}
        WHERE p.eff_brand <> ''
        GROUP BY p.eff_brand
        ORDER BY count DESC, value
      `,
      sql`
        SELECT p.eff_category AS value, COUNT(*) AS count
        FROM ${derivedProducts()}
        GROUP BY p.eff_category
        ORDER BY count DESC, value
      `,
      sql`
        SELECT
          COUNT(*) FILTER (WHERE COALESCE(stock, 0) >  0) AS in_stock,
          COUNT(*) FILTER (WHERE COALESCE(stock, 0) <= 0) AS out_stock,
          COUNT(*) FILTER (WHERE COALESCE(description, '') = '') AS no_description,
          COUNT(*) FILTER (WHERE COALESCE(attributes, '{}') IN ('{}', '')) AS no_attributes,
          COUNT(*) FILTER (WHERE COALESCE(image_url, '') IN ('', ${LOCAL_PLACEHOLDER})) AS no_image
        FROM products
      `,
    ]);

    const brands = brandRows as unknown as AdminFacet[];
    const categories = categoryRows as unknown as AdminFacet[];
    const t = (
      totalRows as unknown as {
        in_stock: number;
        out_stock: number;
        no_description: number;
        no_attributes: number;
        no_image: number;
      }[]
    )[0];
    return {
      brands,
      categories,
      availability: { in: t?.in_stock ?? 0, out: t?.out_stock ?? 0 },
      missing: {
        description: t?.no_description ?? 0,
        attributes: t?.no_attributes ?? 0,
        image: t?.no_image ?? 0,
      },
    };
  };

  try {
    return await run();
  } catch (caught) {
    if (!isMissingSchemaError(caught)) throw caught;
    await ensureProductsTable();
    return run();
  }
}

/* ------------------------------ login attempts ----------------------------- */

/**
 * Failed logins, keyed by a salted hash of the caller's IP and which login this
 * was against — `"admin"` (`app/actions/auth.ts`), `"customer"`
 * (`app/actions/customer-auth.ts`) or `"reset"` (password-reset requests, which
 * are throttled the same way so nobody can flood a customer's inbox). One
 * shared table, scoped by that column, so a flood against one never eats into
 * another's budget.
 *
 * Neither login strictly needs a database to function — the admin one reads
 * only environment variables, and a missing customer table just means "no
 * such account" — so this table exists purely to slow down a scripted brute
 * force. Both call sites skip these checks entirely when there is no database
 * configured; the login still works, it just loses this extra layer.
 */
export type LoginScope = "admin" | "customer" | "reset";

export async function ensureLoginAttemptsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id           integer PRIMARY KEY AUTOINCREMENT,
      scope        text NOT NULL,
      ip_hash      text NOT NULL,
      -- Which *account* was guessed at, as a salted hash of the email. A
      -- per-IP budget alone is blind to the attack that actually matters here:
      -- credential stuffing driven from a botnet, where every request carries
      -- a fresh address but always targets the same handful of accounts. Empty
      -- for the admin login, which has one account by definition.
      account_hash text NOT NULL DEFAULT '',
      created_at   text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS login_attempts_scope_ip_idx
    ON login_attempts (scope, ip_hash, created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS login_attempts_scope_account_idx
    ON login_attempts (scope, account_hash, created_at DESC)
  `;
}

let loginAttemptsSchemaReady: Promise<void> | null = null;

/** Memoized per process — the DDL is idempotent but costs a round trip. */
export function ensureLoginAttemptsSchema(): Promise<void> {
  loginAttemptsSchemaReady ??= ensureLoginAttemptsTable().catch((error: unknown) => {
    loginAttemptsSchemaReady = null;
    throw error;
  });
  return loginAttemptsSchemaReady;
}

/** How many failed attempts this IP has made recently against this login. */
export async function countRecentLoginAttempts(
  scope: LoginScope,
  ipHash: string,
  withinMinutes: number,
): Promise<number> {
  const rows = (await sql`
    SELECT count(*) AS n
    FROM login_attempts
    WHERE scope = ${scope}
      AND ip_hash = ${ipHash}
      AND created_at > ${ago(`-${Math.max(0, Math.floor(withinMinutes))} minutes`)}
  `) as unknown as { n: number }[];
  return rows[0]?.n ?? 0;
}

/**
 * How many failed attempts this *account* has collected recently, from any
 * address. Deliberately a wider window and a larger allowance than the per-IP
 * budget (see `lib/login-rate-limit.ts`): this one exists to stop a slow,
 * distributed grind, not to punish someone who mistyped their password twice
 * from two devices.
 */
export async function countRecentAccountLoginAttempts(
  scope: LoginScope,
  accountHash: string,
  withinMinutes: number,
): Promise<number> {
  const rows = (await sql`
    SELECT count(*) AS n
    FROM login_attempts
    WHERE scope = ${scope}
      AND account_hash = ${accountHash}
      AND account_hash <> ''
      AND created_at > ${ago(`-${Math.max(0, Math.floor(withinMinutes))} minutes`)}
  `) as unknown as { n: number }[];
  return rows[0]?.n ?? 0;
}

/**
 * Record one failed login attempt.
 *
 * Occasionally sweeps the table on the way out. Nothing here is of any value
 * once its window has passed, and this is the only write path, so a
 * probabilistic purge keeps the table small without a scheduled job.
 */
export async function recordFailedLogin(
  scope: LoginScope,
  ipHash: string,
  accountHash = "",
): Promise<void> {
  await sql`
    INSERT INTO login_attempts (scope, ip_hash, account_hash)
    VALUES (${scope}, ${ipHash}, ${accountHash})
  `;

  if (Math.random() < 0.02) {
    try {
      await sql`DELETE FROM login_attempts WHERE created_at < ${ago("-1 day")}`;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      console.error(`[db] login_attempts cleanup failed: ${message}`);
    }
  }
}
