"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { useProducts } from "@/context/ProductsContext";
import type { Product } from "@/lib/products";

const RECOMMENDED_COUNT = 8;

/**
 * Rank inside one brand: what the shop flagged, then the flagship model.
 *
 * Price descending is what puts machines on the front page and leaves the
 * chains and oils to the catalog — an accessory is a fine product and a poor
 * shop window. A real photo only breaks ties: ranking by it first sounds
 * appealing but promotes whichever cheap item happens to have been
 * photographed, which is how a 264 ₴ chain lands next to the saws.
 */
function byProminence(a: Product, b: Product): number {
  const badge = (product: Product) =>
    Number(product.isBestseller === true) * 2 + Number(product.isPromo === true);
  const byBadge = badge(b) - badge(a);
  if (byBadge !== 0) {
    return byBadge;
  }
  if (a.price !== b.price) {
    return b.price - a.price;
  }
  const photographed = (product: Product) =>
    Number(Boolean(product.imageUrl) && !product.imageUrl.includes("placeholder"));
  return photographed(b) - photographed(a);
}

/**
 * Compact homepage selection.
 *
 * The catalog arrives sorted by name, so taking the first eight sellable rows
 * used to fill the block with whatever happened to start with "А", often with
 * several variants of one product. Instead the eight slots are shared between
 * brands **in proportion to how much of the catalog each one is**, biggest
 * first: a shop whose assortment is more than half one brand shows that on its
 * front page, while the smaller brands still get a card each rather than being
 * invisible.
 *
 * No brand is named anywhere here on purpose. "Which brand leads" is a fact
 * about the catalog — how many sellable products carry it — not about the code,
 * so it keeps answering itself as the assortment changes, including for brands
 * added years from now. Within a brand the shop's own markers ("Топ продажів",
 * "Акція") win, which is the intended way to push one specific model onto the
 * homepage: tick the box in /admin.
 */
export default function RecommendedProducts() {
  const { products, loading } = useProducts();

  const recommended = useMemo(() => {
    const sellable = products.filter(
      (product) => product.inStock !== false && product.price > 0,
    );

    // Group by brand. Unbranded rows share the "" bucket and are used last.
    const byBrand = new Map<string, Product[]>();
    for (const product of sellable) {
      const brand = product.brand.trim();
      const bucket = byBrand.get(brand);
      if (bucket) {
        bucket.push(product);
      } else {
        byBrand.set(brand, [product]);
      }
    }

    const ranked = [...byBrand.entries()]
      .map(([brand, items]) => ({ brand, items: [...items].sort(byProminence) }))
      // Assortment depth as the measure of how central a brand is to this shop,
      // with unbranded rows always last — a card that names no brand tells a
      // visitor nothing, so those only ever fill a gap.
      .sort((a, b) =>
        a.brand === "" ? 1 : b.brand === "" ? -1 : b.items.length - a.items.length,
      );

    // Unbranded rows are excluded from the share: in a catalog imported from an
    // accounting system they are often the majority, and letting them set the
    // proportions would hand the homepage to products that show no brand at all.
    const brandedTotal = ranked
      .filter((group) => group.brand !== "")
      .reduce((sum, group) => sum + group.items.length, 0);

    const picked: Product[] = [];
    for (const group of ranked) {
      const free = RECOMMENDED_COUNT - picked.length;
      if (free <= 0) break;
      // At least one card for any brand that reaches this point, so a small
      // brand is represented rather than rounded away.
      const quota =
        group.brand === "" || brandedTotal === 0
          ? free
          : Math.max(
              1,
              Math.round((group.items.length / brandedTotal) * RECOMMENDED_COUNT),
            );
      picked.push(...group.items.slice(0, Math.min(quota, free)));
    }
    return picked;
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
