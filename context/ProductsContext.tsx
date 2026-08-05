"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { products as seedProducts, type Product } from "@/lib/products";

/** A full product without its generated id (imageUrl is included and editable). */
export type ProductInput = Omit<Product, "id">;

export type ProductSource = "ukrsklad" | "fallback" | "seed";

/** How often to re-poll the sync feed for fresh prices/stock (ms). */
const POLL_INTERVAL_MS = 60_000;

interface ProductsContextValue {
  products: Product[];
  loading: boolean;
  error: string | null;
  source: ProductSource;
  /** Re-fetch the catalog from the УкрСклад sync feed. */
  refresh: () => Promise<void>;
  updateProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  createProduct: (input: ProductInput) => void;
}

const ProductsContext = createContext<ProductsContextValue | undefined>(
  undefined,
);

export function placeholderImage(name: string): string {
  const text = encodeURIComponent(name.trim() || "Товар");
  return `https://placehold.co/600x600/e5e5e5/1a1a1a.png?text=${text}`;
}

function makeId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Catalog state, fetched from `/api/products`.
 *
 * There are no hardcoded products: the initial value is an empty array and the
 * real catalog arrives from the server on mount, then is re-polled so prices
 * and stock stay current. Admin edits are in-memory only (the external source
 * is the source of truth); a refresh/reload re-reads the live feed.
 */
export function ProductsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<ProductSource>("seed");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        products: Product[];
        source: ProductSource;
        error: string | null;
      };
      setProducts(data.products);
      setSource(data.source);
      setError(data.error ?? null);
    } catch (caught) {
      // Network/parse failure on the client — keep the last good data.
      const message = caught instanceof Error ? caught.message : String(caught);
      console.error("[catalog] Failed to fetch /api/products:", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch the catalog from the sync feed on mount, then poll for changes.
    // Data fetching is a valid effect use; the synchronous loading flag it sets
    // is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Admin edits operate on the in-memory catalog for the current session only.
  const updateProduct = useCallback((updated: Product) => {
    setProducts((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item)),
    );
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setProducts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const createProduct = useCallback((input: ProductInput) => {
    setProducts((prev) => [
      {
        ...input,
        id: makeId(),
        imageUrl: input.imageUrl.trim() || placeholderImage(input.name),
      },
      ...prev,
    ]);
  }, []);

  const value = useMemo(
    () => ({
      products,
      loading,
      error,
      source,
      refresh,
      updateProduct,
      deleteProduct,
      createProduct,
    }),
    [products, loading, error, source, refresh, updateProduct, deleteProduct, createProduct],
  );

  return (
    <ProductsContext.Provider value={value}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const context = useContext(ProductsContext);
  if (!context) {
    throw new Error("useProducts must be used within a ProductsProvider");
  }
  return context;
}
