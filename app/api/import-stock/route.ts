import {
  CONNECTION_ENV_VARS,
  ensureProductsTable,
  hasDatabase,
  upsertProducts,
  type ImportItem,
} from "@/lib/db";

/**
 * POST /api/import-stock
 *
 * Bulk import/refresh of the product catalog from an external script.
 *
 * Body: { token: string, items: [{ sku, name, price, stock }] }
 * Auth: `token` must equal the IMPORT_TOKEN environment variable.
 *
 * Responds { success: true, updated: N }.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Length-aware constant-time comparison, so timing cannot leak the token. */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Coerce a loosely-typed incoming value into a finite number. */
function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseItems(raw: unknown): { items: ImportItem[]; skipped: number } {
  if (!Array.isArray(raw)) {
    return { items: [], skipped: 0 };
  }

  const items: ImportItem[] = [];
  let skipped = 0;

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      skipped += 1;
      continue;
    }
    const record = entry as Record<string, unknown>;
    const sku = String(record.sku ?? "").trim();
    const name = String(record.name ?? "").trim();

    // A row without an identifier or a name is unusable.
    if (!sku || !name) {
      skipped += 1;
      continue;
    }

    items.push({
      sku,
      name,
      price: Math.max(0, toNumber(record.price)),
      stock: Math.max(0, Math.round(toNumber(record.stock))),
    });
  }

  return { items, skipped };
}

export async function POST(request: Request) {
  const expectedToken = process.env.IMPORT_TOKEN?.trim();

  // Never accept requests when no token is configured — that would leave the
  // endpoint wide open.
  if (!expectedToken) {
    console.error("[import-stock] IMPORT_TOKEN is not set — refusing request");
    return json(
      { success: false, error: "Server is not configured for imports." },
      500,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body." }, 400);
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const token = typeof payload.token === "string" ? payload.token : "";

  if (!timingSafeEqual(token, expectedToken)) {
    console.warn("[import-stock] Rejected request with an invalid token");
    return json({ success: false, error: "Forbidden" }, 403);
  }

  if (!hasDatabase()) {
    console.error(
      `[import-stock] No connection string. Checked: ${CONNECTION_ENV_VARS.join(", ")}`,
    );
    return json(
      {
        success: false,
        error: "Database is not configured.",
        // Names only — never the values. Makes a misconfiguration obvious
        // from the response instead of requiring a look at the source.
        checkedEnvVars: CONNECTION_ENV_VARS,
      },
      500,
    );
  }

  const { items, skipped } = parseItems(payload.items);

  if (!Array.isArray(payload.items)) {
    return json({ success: false, error: "`items` must be an array." }, 400);
  }

  try {
    await ensureProductsTable();
    const updated = await upsertProducts(items);

    console.info(
      `[import-stock] Upserted ${updated} products (skipped ${skipped} invalid)`,
    );

    return json({ success: true, updated, skipped }, 200);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[import-stock] Import failed: ${message}`);
    return json({ success: false, error: "Import failed." }, 500);
  }
}
