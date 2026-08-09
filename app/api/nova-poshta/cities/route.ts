import { hasNovaPoshtaKey, searchCities } from "@/lib/nova-poshta";

/** GET /api/nova-poshta/cities?q=рат — settlement autocomplete. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const cities = await searchCities(query);

  return Response.json(
    { cities, configured: hasNovaPoshtaKey() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
