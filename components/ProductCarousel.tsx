import ProductCard from "@/components/ProductCard";
import type { Product } from "@/lib/products";

/**
 * A titled row of product cards, used for the recommendation blocks on the
 * product page. Renders nothing when there is nothing to show — an empty
 * "Схожі товари" heading looks like a bug.
 */
export default function ProductCarousel({
  title,
  subtitle,
  products,
}: {
  title: string;
  subtitle?: string;
  products: Product[];
}) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="mt-14">
      <div className="mb-4 border-b border-stone-200 pb-3">
        <h2 className="text-2xl font-extrabold text-stone-800">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
