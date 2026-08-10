-- Merchandising markers on products (Neon Postgres).
--
-- Like the other files here this is documentation: the admin product API runs
-- ensureProductsTable() itself, so you normally do NOT need to execute it.
--
-- Both columns are ADMIN-OWNED: `upsertProducts` (the УкрСклад import) never
-- writes them, so a flag set in the admin panel survives every synchronization,
-- exactly like brand / category / image_url / attributes.

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_promo      boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_bestseller boolean NOT NULL DEFAULT false;

-- "Купують разом" reads real baskets out of orders.items with a containment
-- match (`items @> '[{"sku": "..."}]'`). A GIN index keeps that fast once the
-- order table grows; it is optional while the table is small.
CREATE INDEX IF NOT EXISTS orders_items_gin_idx ON orders USING gin (items jsonb_path_ops);
