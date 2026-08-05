import { loadProducts } from "@/lib/catalog";

// Always read the sync file fresh so updated prices/stock appear on reload.
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await loadProducts();

  return Response.json(
    {
      products: result.products,
      source: result.source,
      count: result.products.length,
      loadedAt: result.loadedAt,
      error: result.error ?? null,
    },
    {
      headers: {
        // Belt-and-suspenders: never let a CDN/browser cache the catalog feed.
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
