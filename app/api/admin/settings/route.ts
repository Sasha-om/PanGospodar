import { getStoreSettings } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/admin/settings
 *
 * Current store contact details, used to populate the admin settings form.
 * The admin panel is a client component, so it cannot read them server-side.
 * Writing goes through the `updateStoreSettings` Server Action, not this route.
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

  // Falls back to the defaults when there is no database, so the form always
  // renders something sensible instead of empty inputs.
  const settings = await getStoreSettings();
  return json({ success: true, settings }, 200);
}
