import type { Product } from "@/lib/products";
import { getConnectionSource, hasDatabase, loadProductsFromDb } from "@/lib/db";
import { loadProductsFromFile } from "@/lib/ukrsklad";

/**
 * Single entry point for reading the catalog.
 *
 * Source priority:
 *   1. Postgres (`products` table) — the production source of truth
 *   2. Local sync file (`UKR_SKLAD_FILE_PATH`) — legacy/offline fallback
 *   3. Empty catalog — nothing configured, the UI shows its empty states
 *
 * A failure never throws: the site renders empty rather than 500-ing.
 */

export type ProductSource = "database" | "ukrsklad" | "fallback";

export interface LoadProductsResult {
  products: Product[];
  source: ProductSource;
  error?: string;
  loadedAt: string;
}

export async function loadProducts(): Promise<LoadProductsResult> {
  const loadedAt = new Date().toISOString();

  if (hasDatabase()) {
    try {
      const products = await loadProductsFromDb();
      console.info(
        `[catalog] Loaded ${products.length} products from Postgres (via ${getConnectionSource()})`,
      );
      return { products, source: "database", loadedAt };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      console.error(`[catalog] Database read failed: ${message}`);
      // Fall through to the file source rather than breaking the whole site.
    }
  }

  return loadProductsFromFile();
}
