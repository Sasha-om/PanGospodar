import Image from "next/image";
import Link from "next/link";
import StarRating from "@/components/StarRating";
import { getProductAttributes, type Product } from "@/lib/products";

/** Compact, flat marketplace-style card tuned for a 4-per-row desktop grid. */
export default function ProductCard({
  product,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const inStock = product.inStock !== false;
  const sku = product.sku ?? product.id;

  // Show the first characteristic we actually have (many rows have none).
  const keySpec = getProductAttributes(product)[0] ?? null;

  return (
    <Link
      href={`/product/${product.id}`}
      className="group relative flex flex-col overflow-hidden rounded-sm border border-stone-200 bg-white transition-colors duration-100 hover:border-accent-500"
    >
      <div className="relative aspect-square w-full shrink-0 overflow-hidden border-b border-stone-200 bg-white">
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          priority={priority}
          className="object-contain p-3"
          sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />

        {/* Stock pill */}
        <span
          className={`absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
            inStock
              ? "border-emerald-200 bg-white text-emerald-700"
              : "border-stone-200 bg-white text-stone-500"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              inStock ? "bg-emerald-500" : "bg-stone-400"
            }`}
            aria-hidden="true"
          />
          {inStock ? "В наявності" : "Немає в наявності"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        {typeof product.rating === "number" ? (
          <StarRating
            rating={product.rating}
            reviewCount={product.reviewCount}
          />
        ) : null}

        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-snug text-stone-800">
          {product.name}
        </h3>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
          <span className="text-stone-400">Код: {sku}</span>
          {product.brand ? (
            <span className="font-semibold uppercase tracking-wide text-stone-500">
              {product.brand}
            </span>
          ) : null}
        </div>

        {keySpec ? (
          <p className="text-[11px] text-stone-500">
            <span className="font-semibold text-stone-600">{keySpec[0]}:</span>{" "}
            {keySpec[1]}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          <span className="text-base font-extrabold text-stone-800">
            {product.price.toLocaleString("uk-UA")} ₴
          </span>
          <span className="rounded-sm bg-accent-500 px-3 py-1.5 text-xs font-bold text-white transition-colors duration-100 group-hover:bg-accent-600">
            Детальніше
          </span>
        </div>
      </div>
    </Link>
  );
}
