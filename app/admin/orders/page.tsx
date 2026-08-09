import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import OrdersList from "@/components/admin/OrdersList";
import { hasDatabase, listOrders } from "@/lib/db";
import type { Order } from "@/lib/orders";

// Orders must never be served from a cache.
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  // The /admin layout already enforces the session, so this is authorized.
  let orders: Order[] = [];
  let error: string | null = null;

  if (!hasDatabase()) {
    error = "База даних не налаштована — замовлення недоступні.";
  } else {
    try {
      orders = await listOrders(100);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      console.error(`[admin/orders] ${error}`);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-100">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <div>
            <h1 className="text-2xl font-extrabold text-stone-800">
              Замовлення
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              {orders.length > 0
                ? `Всього замовлень: ${orders.length}`
                : "Список замовлень магазину."}
            </p>
          </div>
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-sm border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 transition-colors hover:border-accent-500 hover:text-accent-600"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            До адмін-панелі
          </Link>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {error ? (
          <p className="mb-4 rounded-sm border-l-4 border-accent-500 bg-accent-50 px-4 py-3 text-sm text-stone-700">
            {error}
          </p>
        ) : null}

        <div className="rounded-sm border border-stone-200 bg-white">
          <OrdersList orders={orders} />
        </div>
      </main>
    </div>
  );
}
