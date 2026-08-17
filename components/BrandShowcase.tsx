"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { useProducts } from "@/context/ProductsContext";

/**
 * A shelf for one brand on the homepage.
 *
 * Separate from `RecommendedProducts` because it answers a different question:
 * that block says "here is what we sell", this one says "we are the STIHL
 * dealer" — which is the first thing a visitor looking for STIHL wants
 * confirmed, and the reason this shelf sits above the mixed one.
 *
 * Renders **nothing** when the catalog holds no product of this brand. An
 * empty branded shelf would be worse than no shelf: it advertises a gap.
 */
export default function BrandShowcase({
  brand,
  title,
  subtitle,
  limit = 8,
}: {
  /** Matched case-insensitively against `product.brand`. */
  brand: string;
  title?: string;
  subtitle?: string;
  limit?: number;
}) {
  const { products, loading } = useProducts();

  const items = useMemo(() => {
    const wanted = brand.trim().toLowerCase();
    return products
      .filter(
        (product) =>
          product.brand.trim().toLowerCase() === wanted &&
          product.inStock !== false &&
          product.price > 0,
      )
      /*
       * Machines first, consumables last: a chain oil at 349 ₴ is a fine
       * product and a poor advertisement. Sorting by price descending achieves
       * that without needing a category rule, and the "Топ продажів" marker
       * still overrides it — that flag is the shop's own choice of what to
       * lead with.
       */
      .sort((a, b) => {
        const byBadge = Number(b.isBestseller === true) - Number(a.isBestseller === true);
        return byBadge !== 0 ? byBadge : b.price - a.price;
      })
      .slice(0, limit);
  }, [products, brand, limit]);

  // Nothing to show, and nothing to apologise for — including while the
  // catalog is still loading, so no empty frame flashes on first paint.
  if (items.length === 0 || loading) {
    return null;
  }

  return (
    <section className="border-b border-stone-200 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-black leading-none tracking-tight text-accent-500 sm:text-4xl">
              {brand.toUpperCase()}
            </p>
            <h2 className="mt-2 text-2xl font-extrabold text-stone-800">
              {title ?? `Техніка ${brand}`}
            </h2>
            {subtitle ? (
              <p className="mt-1 max-w-2xl text-sm text-stone-600">{subtitle}</p>
            ) : null}
          </div>

          <Link
            href={`/catalog?q=${encodeURIComponent(brand)}`}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-accent-600 transition-colors duration-100 hover:text-accent-700"
          >
            Уся техніка {brand}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {items.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              priority={index < 4}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
