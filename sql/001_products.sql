-- Product catalog table (Neon Postgres).
--
-- The /api/import-stock and /api/admin/products routes run this automatically
-- (CREATE TABLE / ADD COLUMN IF NOT EXISTS), so you normally do NOT need to
-- execute it by hand. Kept here as documentation and for manual setup via the
-- Neon SQL Editor.

CREATE TABLE IF NOT EXISTS products (
  sku        text PRIMARY KEY,
  name       text NOT NULL,
  price      numeric,
  stock      numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Admin-owned columns. The УкрСклад import never writes these, so values set
-- in the admin panel survive every synchronization.
ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category   text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand      text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url  text;

-- Speeds up the catalog listing, which is ordered by name.
CREATE INDEX IF NOT EXISTS products_name_idx ON products (name);
