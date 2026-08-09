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
  /** Diagnostics — why the catalog is empty is otherwise invisible in prod. */
  diagnostics?: {
    /** Was a Postgres connection string found in the environment? */
    databaseConfigured: boolean;
    /** Name of the env var that supplied it (never the value). */
    connectionSource?: string;
    /** Error text if the database was configured but reading it failed. */
    databaseError?: string;
  };
}

export async function loadProducts(): Promise<LoadProductsResult> {
  const loadedAt = new Date().toISOString();
  const databaseConfigured = hasDatabase();
  const connectionSource = getConnectionSource();
  let databaseError: string | undefined;

  if (databaseConfigured) {
    try {
      const products = await loadProductsFromDb();
      console.info(
        `[catalog] Loaded ${products.length} products from Postgres (via ${connectionSource})`,
      );
      return {
        products,
        source: "database",
        loadedAt,
        diagnostics: { databaseConfigured, connectionSource },
      };
    } catch (caught) {
      databaseError = caught instanceof Error ? caught.message : String(caught);
      console.error(`[catalog] Database read failed: ${databaseError}`);
      // Fall through to the file source rather than breaking the whole site —
      // but keep the reason so it reaches the API response.
    }
  } else {
    console.warn("[catalog] No Postgres connection string found in env");
  }

  const fileResult = await loadProductsFromFile();
  return {
    ...fileResult,
    diagnostics: { databaseConfigured, connectionSource, databaseError },
  };
}
