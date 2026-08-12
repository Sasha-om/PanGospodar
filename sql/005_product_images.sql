-- Multiple photos per product (Neon Postgres).
--
-- Like the other files here this is documentation: the admin product API runs
-- ensureProductsTable() itself, so you normally do NOT need to execute it.
--
-- `images` holds EVERY photo of the product as a JSON array of URLs, in display
-- order, with the main photo first. `image_url` keeps holding that first entry:
-- cards, the cart, order emails and social previews read only that column, so
-- they keep working unchanged — and on a database where `images` is still empty
-- the product simply has one photo.
--
-- ADMIN-OWNED, like brand / category / image_url / attributes: `upsertProducts`
-- (the УкрСклад import) never writes it, so a gallery uploaded in the admin
-- panel survives every synchronization.

ALTER TABLE products ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: treat an existing single photo as a one-item gallery. Optional —
-- the application falls back to `image_url` when `images` is empty.
-- UPDATE products
--    SET images = jsonb_build_array(image_url)
--  WHERE images = '[]'::jsonb AND COALESCE(image_url, '') <> '';
