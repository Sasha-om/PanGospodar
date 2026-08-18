import {
  deleteProductBySku,
  ensureProductsTable,
  hasDatabase,
  sanitizeAttributes,
  sanitizeDescription,
  sanitizeImageList,
  updateProductFromAdmin,
} from "@/lib/db";
import { getSession } from "@/lib/session";
import { safeCategorySlug } from "@/lib/product-mapping";

/**
 * Admin-only writes for a single product.
 *
 * POST   — create/update (upsert by sku), including free-form attributes
 * DELETE — remove by sku
 *
 * Authorization is the admin session cookie, the same one that guards /admin.
 * There is no token here on purpose: this endpoint is driven by the logged-in
 * admin UI, not by an external script.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function requireAdmin(): Promise<boolean> {
  try {
    return (await getSession()) !== null;
  } catch {
    return false;
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  if (!hasDatabase()) {
    return json({ success: false, error: "Database is not configured." }, 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body." }, 400);
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const sku = String(payload.sku ?? "").trim();
  const name = String(payload.name ?? "").trim();

  if (!sku || !name) {
    return json(
      { success: false, error: "`sku` and `name` are required." },
      400,
    );
  }

  try {
    await ensureProductsTable();
    await updateProductFromAdmin({
      sku,
      name,
      brand: String(payload.brand ?? "").trim(),
      category: safeCategorySlug(String(payload.category ?? "").trim()),
      price: Math.max(0, toNumber(payload.price)),
      stock: Math.max(0, Math.round(toNumber(payload.stock))),
      imageUrl: String(payload.imageUrl ?? "").trim(),
      images: sanitizeImageList(payload.images),
      barcode: String(payload.barcode ?? "").trim(),
      // `shortDescription` is what the field is called on `Product`; the older
      // `description` is accepted too so a hand-written request keeps working.
      description: sanitizeDescription(
        payload.shortDescription ?? payload.description,
      ),
      attributes: sanitizeAttributes(payload.attributes),
      isPromo: payload.isPromo === true,
      isBestseller: payload.isBestseller === true,
    });
    return json({ success: true, sku }, 200);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[admin/products] Save failed: ${message}`);
    return json({ success: false, error: "Save failed." }, 500);
  }
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  if (!hasDatabase()) {
    return json({ success: false, error: "Database is not configured." }, 500);
  }

  const sku = new URL(request.url).searchParams.get("sku")?.trim();
  if (!sku) {
    return json({ success: false, error: "`sku` is required." }, 400);
  }

  try {
    await deleteProductBySku(sku);
    return json({ success: true, sku }, 200);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[admin/products] Delete failed: ${message}`);
    return json({ success: false, error: "Delete failed." }, 500);
  }
}
