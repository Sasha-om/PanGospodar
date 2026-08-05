-- Product catalog table (Neon Postgres).
--
-- The /api/import-stock route runs this automatically (CREATE TABLE IF NOT
-- EXISTS), so you normally do NOT need to execute it by hand. It is kept here
-- as documentation and for manual setup via the Neon SQL Editor.

CREATE TABLE IF NOT EXISTS products (
  sku        text PRIMARY KEY,
  name       text NOT NULL,
  price      numeric,
  stock      numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Speeds up the catalog listing, which is ordered by name.
CREATE INDEX IF NOT EXISTS products_name_idx ON products (name);
