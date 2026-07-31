"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { useProducts } from "@/context/ProductsContext";

const RECOMMENDED_COUNT = 8;

/**
 * Compact homepage selection: in-stock, priced items, preferring recognizable
 * brands so the front page looks curated rather than alphabetical.
 */
export default function RecommendedProducts() {
  const { products, loading } = useProducts();

  const recommended = useMemo(() => {
    const sellable = products.filter(
      (product) => product.inStock !== false && product.price > 0,
    );
    const branded = sellable.filter((product) => product.brand);
    const rest = sellable.filter((product) => !product.brand);
    return [...branded, ...rest].slice(0, RECOMMENDED_COUNT);
  }, [products]);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-extrabold text-stone-800">
          Рекомендовані товари
        </h2>
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-accent-600 transition-colors duration-100 hover:text-accent-700"
        >
          Увесь каталог
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {recommended.length === 0 ? (
        <p className="rounded-sm border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">
          {loading ? "Завантаження товарів..." : "Товари скоро з'являться."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {recommended.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </div>
      )}
    </section>
  );
}
