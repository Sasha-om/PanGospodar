import { hasDatabase, loadAdminFacets } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/admin/products/facets
 *
 * Counts behind the admin catalog filter sidebar — brands, categories,
 * availability and the "missing data" groups — so the panel only offers values
 * that actually match something.
 *
 * Deliberately separate from the search route: search re-runs on every
 * keystroke, while these totals only shift after an edit or an import, so the
 * admin fetches them once per session instead of per character.
 *
 * Guarded by the admin session cookie, like the other /api/admin routes.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    if ((await getSession()) === null) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
  } catch {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  if (!hasDatabase()) {
    // The admin falls back to client-side filtering without a database.
    return json({ success: false, error: "Database is not configured." }, 503);
  }

  try {
    return json({ success: true, facets: await loadAdminFacets() }, 200);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[admin/facets] Failed: ${message}`);
    return json({ success: false, error: message }, 500);
  }
}
