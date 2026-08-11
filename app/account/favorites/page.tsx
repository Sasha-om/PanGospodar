import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart } from "lucide-react";
import AccountShell from "@/components/account/AccountShell";
import ProductCard from "@/components/ProductCard";
import { loadProducts } from "@/lib/catalog";
import { getCustomerId } from "@/lib/customer-session";
import {
  findCustomerById,
  hasDatabase,
  listFavorites,
  listOrdersForCustomer,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AccountFavoritesPage() {
  const customerId = await getCustomerId();
  if (!customerId) {
    redirect("/account/login?from=/account/favorites");
  }

  const customer = hasDatabase() ? await findCustomerById(customerId) : null;
  if (!customer) {
    redirect("/account/login");
  }

  const [skus, orders, { products }] = await Promise.all([
    listFavorites(customerId),
    listOrdersForCustomer(customerId, customer.email, customer.phone),
    loadProducts(),
  ]);

  // Saved codes are resolved against the live catalog, so prices and stock are
  // current — and an item that has since left the catalog simply drops out.
  const bySku = new Map(products.map((p) => [p.sku ?? p.id, p]));
  const saved = skus
    .map((sku) => bySku.get(sku))
    .filter((product): product is NonNullable<typeof product> => Boolean(product));
  const missing = skus.length - saved.length;

  return (
    <AccountShell
      active="favorites"
      name={customer.name}
      email={customer.email}
      orderCount={orders.length}
      favoriteCount={skus.length}
    >
      {saved.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-sm border border-stone-200 bg-white p-10 text-center">
          <Heart className="h-10 w-10 text-stone-300" aria-hidden="true" />
          <h2 className="text-lg font-bold text-stone-800">
            Улюблених товарів поки немає
          </h2>
          <p className="max-w-md text-sm text-stone-600">
            Натискайте на сердечко на картці товару, щоб зберегти його тут.
          </p>
          <Link
            href="/catalog"
            className="mt-2 rounded-sm bg-accent-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-accent-600"
          >
            Перейти до каталогу
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          {missing > 0 ? (
            <p className="mt-4 text-sm text-stone-500">
              {missing}{" "}
              {missing === 1 ? "товар більше недоступний" : "товарів більше недоступні"}{" "}
              і не показані.
            </p>
          ) : null}
        </>
      )}
    </AccountShell>
  );
}
