import { hasDatabase, searchProductsForAdmin } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/admin/products/search?q=&limit=20&offset=0
 *
 * Paged catalog search for the admin table. Filtering and paging happen in
 * Postgres, so the browser receives at most `limit` rows instead of the whole
 * catalog.
 *
 * Guarded by the admin session cookie, like the other /api/admin routes.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  try {
    if ((await getSession()) === null) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
  } catch {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  if (!hasDatabase()) {
    // The admin falls back to client-side filtering when there is no database
    // (local development against the file source).
    return json(
      { success: false, error: "Database is not configured." },
      503,
    );
  }

  const params = new URL(request.url).searchParams;
  const query = params.get("q") ?? "";
  const limit = Number(params.get("limit") ?? DEFAULT_LIMIT);
  const offset = Number(params.get("offset") ?? 0);

  // Repeated params (?brand=STIHL&brand=Bosch). Values are matched against
  // fixed sets or compared as bound parameters, never concatenated into SQL.
  const list = (key: string) =>
    params.getAll(key).map((value) => value.trim()).filter(Boolean);

  const availabilityParam = params.get("availability");
  const availability =
    availabilityParam === "in" || availabilityParam === "out"
      ? availabilityParam
      : null;

  const allowed = (key: string, valid: readonly string[]) =>
    list(key).filter((value) => valid.includes(value));

  try {
    const result = await searchProductsForAdmin({
      query,
      limit: Number.isFinite(limit) ? limit : DEFAULT_LIMIT,
      offset: Number.isFinite(offset) ? offset : 0,
      filters: {
        brands: list("brand"),
        categories: list("category"),
        availability,
        badges: allowed("badge", ["promo", "bestseller"]),
        missing: allowed("missing", ["description", "attributes", "image"]),
      },
    });
    return json({ success: true, ...result }, 200);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[admin/search] Failed: ${message}`);
    return json({ success: false, error: message }, 500);
  }
}
