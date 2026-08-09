-- Orders and stock reservations (Neon Postgres).
--
-- Like 001_products.sql, this is documentation: the checkout action and the
-- admin status action run the same statements automatically (CREATE TABLE /
-- ADD COLUMN IF NOT EXISTS), so you normally do NOT need to execute it by hand.

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
);

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);

-- Does this order currently hold a stock reservation?
--
-- Stock is deducted when the order is placed and returned when it is cancelled.
-- Only a status change that flips this flag moves `products.stock`, which is
-- what makes the admin buttons idempotent: pressing "Скасувати" twice, or two
-- admins pressing it at once, restocks exactly once.
--
-- Existing rows default to false — they were placed before stock tracking, so
-- cancelling them must not credit back quantities that never left the shelf.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_applied boolean NOT NULL DEFAULT false;

-- The guard that makes overselling impossible. A deduction that would take a
-- product below zero is rejected by Postgres, and because the deduction shares
-- a transaction with the order row, the order rolls back with it.
--
-- NOT VALID skips the scan of existing rows (an older import may have left
-- negative balances behind); every INSERT/UPDATE from here on is still checked.
DO $$
BEGIN
  ALTER TABLE products
    ADD CONSTRAINT products_stock_non_negative CHECK (stock >= 0) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
