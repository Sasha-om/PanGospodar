import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit configuration — how `npm run db:push` reaches the database.
 *
 * Next.js loads `.env.local` itself, but drizzle-kit runs outside it, so the
 * file is read here explicitly.
 */
config({ path: ".env.local" });

const url = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!url) {
  throw new Error(
    "TURSO_DATABASE_URL is not set. Add it to .env.local (see .env.example), " +
      'or point it at a local file for a dry run: TURSO_DATABASE_URL="file:local.db"',
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
