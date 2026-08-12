"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getProductImages,
  products as seedProducts,
  type Product,
} from "@/lib/products";

/** A full product without its generated id (imageUrl is included and editable). */
export type ProductInput = Omit<Product, "id">;

export type ProductSource = "database" | "ukrsklad" | "fallback" | "seed";

/** How often to re-poll the sync feed for fresh prices/stock (ms). */
const POLL_INTERVAL_MS = 60_000;

interface ProductsContextValue {
  products: Product[];
  loading: boolean;
  error: string | null;
  source: ProductSource;
  /** Re-fetch the catalog from the server. */
  refresh: () => Promise<void>;
  /** Persist to the database, then refresh. Throws on failure. */
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  createProduct: (input: ProductInput) => Promise<void>;
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
 * and stock stay current. Admin edits are written to the database through
 * `/api/admin/products` and the catalog is re-read afterwards.
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

  /** POST an admin edit to the database, then re-read the catalog. */
  const saveProduct = useCallback(
    async (product: Product) => {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: product.sku ?? product.id,
          name: product.name,
          brand: product.brand,
          category: product.categorySlug,
          price: product.price,
          stock: product.quantity ?? 0,
          imageUrl: product.imageUrl,
          // Main photo first, gallery after — the server keeps the two columns
          // in step, so sending the whole list is enough.
          images: getProductImages(product),
          barcode: product.barcode ?? "",
          attributes: product.attributes ?? {},
          isPromo: product.isPromo === true,
          isBestseller: product.isBestseller === true,
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? `HTTP ${response.status}`);
      }
      await refresh();
    },
    [refresh],
  );

  const updateProduct = useCallback(
    (updated: Product) => saveProduct(updated),
    [saveProduct],
  );

  const createProduct = useCallback(
    (input: ProductInput) =>
      saveProduct({
        ...input,
        // A new product needs an article; derive one when the admin has none.
        id: input.sku?.trim() || makeId(),
        sku: input.sku?.trim() || makeId(),
        imageUrl: input.imageUrl.trim() || placeholderImage(input.name),
      }),
    [saveProduct],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const response = await fetch(
        `/api/admin/products?sku=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? `HTTP ${response.status}`);
      }
      await refresh();
    },
    [refresh],
  );

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
