-- Store contact details editable from the admin panel (Neon Postgres).
--
-- Like the other files here this is documentation: the settings API route and
-- the save action run CREATE TABLE IF NOT EXISTS themselves, so you normally do
-- NOT need to execute it by hand.
--
-- Key/value rather than one wide row: a new setting needs no migration, and a
-- missing key simply falls back to the built-in default in
-- lib/store-settings.ts instead of rendering an empty phone number.
--
-- Recognised keys: name, phone, email, hours, address.
-- `hours` holds the whole schedule in one string, lines separated by ";":
--   Пн-Пт: 08:30 – 18:00; Сб: 09:00 – 15:00; Нд: вихідний

CREATE TABLE IF NOT EXISTS store_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
