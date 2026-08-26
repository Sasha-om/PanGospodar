import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit configuration — how `npm run db:push` reaches the database.
 *
 * Next.js loads `.env.local` itself, but drizzle-kit runs outside it, so the
 * file is read here explicitly.
 */
config({ path: ".env.local" });

/**
 * Both spellings are accepted, most specific first: the Vercel↔Turso
 * integration provisions the `STORAGE_`-prefixed names (so `vercel env pull`
 * lands those in `.env.local`), while a hand-written file uses the plain ones.
 * Kept in step with `TURSO_URL_ENV_VARS` in `lib/libsql.ts`, which drizzle-kit
 * cannot import — it loads this file outside the Next.js path aliases.
 */
const URL_ENV_VARS = ["STORAGE_TURSO_DATABASE_URL", "TURSO_DATABASE_URL"];
const TOKEN_ENV_VARS = ["STORAGE_TURSO_AUTH_TOKEN", "TURSO_AUTH_TOKEN"];

const firstSet = (names: string[]) =>
  names.map((name) => process.env[name]?.trim()).find(Boolean);

const url = firstSet(URL_ENV_VARS);
const authToken = firstSet(TOKEN_ENV_VARS);

if (!url) {
  throw new Error(
    `No database URL. Set one of ${URL_ENV_VARS.join(" / ")} in .env.local ` +
      '(see .env.example), or point it at a local file for a dry run: ' +
      'TURSO_DATABASE_URL="file:local.db"',
  );
}

/**
 * A local `file:` database needs no auth token, and the `turso` dialect
 * requires one — so a local dry run uses the plain `sqlite` dialect. The
 * schema applied is identical either way.
 */
const isLocalFile = url.startsWith("file:");

export default defineConfig({
  schema: "./lib/schema.ts",
  out: "./drizzle",
  ...(isLocalFile
    ? { dialect: "sqlite" as const, dbCredentials: { url } }
    : {
        dialect: "turso" as const,
        dbCredentials: { url, authToken },
      }),
  strict: true,
  verbose: true,
});
