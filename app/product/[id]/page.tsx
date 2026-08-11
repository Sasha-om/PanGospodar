import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import AddToCartButton from "@/components/AddToCartButton";
import CompareButton from "@/components/CompareButton";
import ProductOrderActions from "@/components/product/ProductOrderActions";
import ProductReviews from "@/components/product/ProductReviews";
import StarRating from "@/components/StarRating";
import ProductCarousel from "@/components/ProductCarousel";
import { loadProducts } from "@/lib/catalog";
import { findCoPurchasedSkus } from "@/lib/db";
import { getProductAttributes } from "@/lib/products";
import { findBoughtTogether, findSimilarProducts } from "@/lib/recommendations";

// Read the live sync feed on every request so prices/stock are current.
export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { products } = await loadProducts();
  const product = products.find((item) => item.id === id);

  if (!product) {
    notFound();
  }

  const inStock = product.inStock ?? true;
  // Units the customer may actually buy. `undefined` = the accounting system
  // reported no quantity for this item, so no ceiling is enforced.
  const stock =
    typeof product.quantity === "number"
      ? product.quantity
      : inStock
        ? undefined
        : 0;
  // Legacy techSpecs merged with the free-form attributes set in the admin.
  const specRows = getProductAttributes(product).map(([label, value]) => ({
    label,
    value,
  }));

  // Real baskets first; the rules in `findBoughtTogether` fill the rest. The
  // lookup never throws — an empty list simply means "no history yet".
  const coPurchasedSkus = await findCoPurchasedSkus(product.sku ?? product.id);
  const similar = findSimilarProducts(product, products);
  const boughtTogether = findBoughtTogether(product, products, coPurchasedSkus);
  // Drives the subtitle, so the block is honest about where its picks came from.
  const hasRealHistory = coPurchasedSkus.some((sku) =>
    boughtTogether.some((item) => (item.sku ?? item.id) === sku),
  );

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-sm border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition-colors duration-100 hover:border-accent-500 hover:text-accent-600"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Назад до каталогу
        </Link>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 sm:px-6">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div className="relative aspect-square w-full overflow-hidden rounded-sm border border-stone-200 bg-stone-50">
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              priority
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Код: {product.sku ?? product.id}
                {product.barcode ? (
                  <>
                    <span className="mx-2 text-stone-300">|</span>
                    Артикул: {product.barcode}
                  </>
                ) : null}
              </p>
              <h1 className="mt-1 text-3xl font-extrabold leading-tight text-stone-800 sm:text-4xl">
                {product.name}
              </h1>
              {typeof product.rating === "number" ? (
                <a
                  href="#reviews"
                  className="mt-2 inline-flex w-fit transition-opacity hover:opacity-80"
                >
                  <StarRating
                    rating={product.rating}
                    reviewCount={product.reviewCount}
                  />
                </a>
              ) : null}
              {product.shortDescription ? (
                <p className="mt-3 text-base text-stone-600">
                  {product.shortDescription}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="text-4xl font-extrabold text-stone-800">
                {product.price.toLocaleString("uk-UA")} ₴
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
                  inStock
                    ? "bg-green-100 text-green-700"
                    : "bg-stone-100 text-stone-500"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    inStock ? "bg-green-500" : "bg-stone-400"
                  }`}
                  aria-hidden="true"
                />
                {inStock
                  ? typeof product.quantity === "number"
                    ? `В наявності: ${product.quantity} шт.`
                    : "В наявності"
                  : "Немає в наявності"}
              </span>
            </div>

            {specRows.length > 0 ? (
              <div className="overflow-hidden rounded-sm border border-stone-200">
                <div className="bg-stone-950 px-4 py-3">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-white">
                    Технічні характеристики
                  </h2>
                </div>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {specRows.map((row, index) => (
                      <tr
                        key={row.label}
                        className={index % 2 === 0 ? "bg-white" : "bg-stone-50"}
                      >
                        <th className="w-1/2 border-b border-stone-200 px-4 py-3 text-left font-semibold text-stone-700">
                          {row.label}
                        </th>
                        <td className="border-b border-stone-200 px-4 py-3 font-bold text-accent-600">
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
              <ProductOrderActions
                productId={product.id}
                name={product.name}
                price={product.price}
                stock={stock}
                disabled={!inStock}
              />

              <div className="flex flex-wrap gap-3">
                <AddToCartButton
                  disabled={!inStock}
                  product={{
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    imageUrl: product.imageUrl,
                    stock,
                  }}
                />
                <CompareButton productId={product.id} variant="full" />
              </div>
            </div>

            {product.brand === "STIHL" ? (
              <Link
                href="/stihl-terms"
                className="text-sm font-semibold text-accent-600 underline-offset-2 transition-colors hover:text-accent-700 hover:underline"
              >
                Умови доставки та оплати товарів STIHL
              </Link>
            ) : null}
          </div>
        </div>

        <ProductReviews
          productId={product.id}
          productSku={product.sku ?? product.id}
        />

        <ProductCarousel
          title="Схожі товари"
          subtitle="З тієї ж групи та в близькій ціні"
          products={similar}
        />
        <ProductCarousel
          title="Купують разом"
          subtitle={
            hasRealHistory
              ? "За історією замовлень нашого магазину"
              : "Витратні матеріали й аксесуари до цього інструмента"
          }
          products={boughtTogether}
        />
      </main>
    </div>
  );
}
