import { getWarehouses, hasNovaPoshtaKey } from "@/lib/nova-poshta";

/** GET /api/nova-poshta/warehouses?cityRef=... — branches for a settlement. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cityRef = new URL(request.url).searchParams.get("cityRef") ?? "";
  const warehouses = await getWarehouses(cityRef);

  return Response.json(
    { warehouses, configured: hasNovaPoshtaKey() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
