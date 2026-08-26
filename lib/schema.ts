import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Turso (libSQL/SQLite) schema for the whole site.
 *
 * This file is the single source of truth for the shape of the database —
 * `npm run db:push` applies it to Turso. The queries themselves stay as
 * hand-written SQL in `lib/db.ts`; Drizzle is used here for the schema and
 * migrations, not as a query builder.
 *
 * Three conventions carried over from the Postgres version, and worth knowing
 * before reading any query:
 *
 *  - **Timestamps are ISO-8601 text**, written by `strftime('%Y-%m-%dT%H:%M:%fZ')`
 *    which produces exactly what JavaScript's `Date#toISOString()` produces.
 *    That format sorts chronologically as plain text, so `ORDER BY created_at`
 *    and `created_at > <window>` both work without any date type.
 *  - **JSON columns are `text`** holding a JSON document (SQLite has no
 *    `jsonb`). They are read with `json_each` / `json_extract`, merged with
 *    `json_patch`, and parsed in JS on the way out.
 *  - **Booleans are `integer`** 0/1, so every read coerces rather than
 *    comparing against `true`.
 */

/** ISO-8601 UTC, byte-identical to `new Date().toISOString()`. */
const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const products = sqliteTable(
  "products",
  {
    sku: text("sku").primaryKey(),
    name: text("name").notNull(),
    /**
     * `name` lowercased in JS on every write.
     *
     * SQLite's `lower()` and case-insensitive `LIKE` are ASCII-only, so they do
     * nothing for a Cyrillic catalogue — searching "бензопила" would not match
     * "Бензопила". Folding the case in JS (which is Unicode-aware) and storing
     * the result is what makes the admin search work at all here; Postgres
     * `ILIKE` needed no such column.
     */
    nameLower: text("name_lower").notNull().default(""),
    price: real("price"),
    stock: real("stock"),
    /** JSON object of spec name to value. */
    attributes: text("attributes").notNull().default("{}"),
    category: text("category"),
    brand: text("brand"),
    imageUrl: text("image_url"),
    /** JSON array of photo URLs, main one first. */
    images: text("images").notNull().default("[]"),
    barcode: text("barcode"),
    /**
     * `barcode` stripped to digits, maintained in JS on write. Replaces the
     * Postgres `regexp_replace(barcode, '[^0-9]', '', 'g')` in the admin
     * search — SQLite ships no regex function.
     */
    barcodeDigits: text("barcode_digits").notNull().default(""),
    /**
     * Three states, and the difference matters to
     * `scripts/generate-descriptions.ts`: NULL means "not looked at yet",
     * empty string means "looked at, nothing reliable to say" (never retried),
     * and text is a real description.
     */
    description: text("description"),
    isPromo: integer("is_promo").notNull().default(0),
    isBestseller: integer("is_bestseller").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(nowIso),
  },
  (table) => [
    index("products_barcode_idx").on(table.barcode),
    index("products_barcode_digits_idx").on(table.barcodeDigits),
    index("products_name_lower_idx").on(table.nameLower),
    /**
     * Stock can never go below zero — the guard that makes overselling
     * impossible. Two checkouts racing for the last item both try to write a
     * negative value, SQLite rejects the second, and its whole transaction —
     * order row included — rolls back.
     *
     * Unlike Postgres, SQLite cannot add a CHECK to an existing table, so this
     * lives in the table definition and `db:push` recreates the table to add it.
     */
    check("products_stock_non_negative", sql`${table.stock} >= 0`),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    status: text("status").notNull().default("NEW"),
    /** Cart checkout, "Купити" or "Зарезервувати". */
    type: text("type").notNull().default("CART"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    contactChannel: text("contact_channel").notNull(),
    city: text("city").notNull(),
    warehouse: text("warehouse").notNull(),
    paymentMethod: text("payment_method").notNull(),
    comment: text("comment"),
    /** JSON array of basket lines. */
    items: text("items").notNull().default("[]"),
    total: real("total").notNull().default(0),
    /**
     * Whether this order currently holds a stock reservation — the flag that
     * makes status changes idempotent. Only a transition that actually flips
     * it moves `products.stock`, so restocking twice is impossible no matter
     * how often "Скасувати" is pressed.
     */
    stockApplied: integer("stock_applied").notNull().default(0),
    /** Salted hash of the submitter's IP — never a real address. */
    ipHash: text("ip_hash").notNull().default(""),
    customerId: integer("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (table) => [
    index("orders_created_at_idx").on(table.createdAt),
    index("orders_ip_hash_created_idx").on(table.ipHash, table.createdAt),
    index("orders_customer_idx").on(table.customerId),
    index("orders_status_idx").on(table.status),
  ],
);

export const storeSettings = sqliteTable("store_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(nowIso),
});

export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productSku: text("product_sku").notNull(),
    authorName: text("author_name").notNull(),
    rating: integer("rating").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("PENDING"),
    ipHash: text("ip_hash").notNull().default(""),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (table) => [
    index("reviews_sku_status_idx").on(
      table.productSku,
      table.status,
      table.createdAt,
    ),
    index("reviews_status_created_idx").on(table.status, table.createdAt),
    index("reviews_ip_created_idx").on(table.ipHash, table.createdAt),
    check("reviews_rating_range", sql`${table.rating} BETWEEN 1 AND 5`),
  ],
);

export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull().default(""),
    phone: text("phone").notNull().default(""),
    /**
     * Session generation. The customer's cookie carries the number it was
     * signed with; bumping it invalidates every session that customer has
     * anywhere. Starts at 1 so an absent value in a token is distinguishable.
     */
    sessionEpoch: integer("session_epoch").notNull().default(1),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (table) => [
    // Email is the login, so uniqueness is enforced by the database rather
    // than by a read-then-write two concurrent signups could race. Addresses
    // are ASCII, so SQLite's ASCII-only `lower()` is enough here.
    uniqueIndex("customers_email_key").on(sql`lower(${table.email})`),
  ],
);

export const favorites = sqliteTable(
  "favorites",
  {
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    productSku: text("product_sku").notNull(),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (table) => [primaryKey({ columns: [table.customerId, table.productSku] })],
);

export const passwordResets = sqliteTable(
  "password_resets",
  {
    /**
     * SHA-256 of the value that went out by email. The raw token exists only
     * in that one message, so a leak of this table hands an attacker nothing
     * usable — the same reasoning as storing password hashes.
     */
    tokenHash: text("token_hash").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (table) => [index("password_resets_expires_idx").on(table.expiresAt)],
);

export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** `"admin"`, `"customer"` or `"reset"`. */
    scope: text("scope").notNull(),
    ipHash: text("ip_hash").notNull(),
    /** Salted hash of the email guessed at. Empty for the admin login. */
    accountHash: text("account_hash").notNull().default(""),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (table) => [
    index("login_attempts_scope_ip_idx").on(
      table.scope,
      table.ipHash,
      table.createdAt,
    ),
    index("login_attempts_scope_account_idx").on(
      table.scope,
      table.accountHash,
      table.createdAt,
    ),
  ],
);
