import Link from "next/link";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import AccountShell from "@/components/account/AccountShell";
import { getCustomerId } from "@/lib/customer-session";
import {
  findCustomerById,
  hasDatabase,
  listFavorites,
  listOrdersForCustomer,
} from "@/lib/db";
import {
  contactChannelLabel,
  formatOrderTotal,
  isReservation,
  orderStatusLabel,
  orderTypeLabel,
  paymentLabel,
  type Order,
  type OrderStatus,
} from "@/lib/orders";

// Order history must never be served from a cache.
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<OrderStatus, string> = {
  NEW: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  CONFIRMED: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  SHIPPED: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
  DONE: "bg-violet-100 text-violet-800 ring-1 ring-violet-200",
  CANCELLED: "bg-red-100 text-red-700 ring-1 ring-red-200",
};

function OrderCard({ order }: { order: Order }) {
  return (
    <li className="rounded-sm border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-extrabold text-stone-800">
              №{order.id}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                STATUS_BADGE[order.status] ?? "bg-stone-100 text-stone-600"
              }`}
            >
              {orderStatusLabel(order.status)}
            </span>
            <span className="text-xs text-stone-500">
              {new Date(order.createdAt).toLocaleString("uk-UA")}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            {orderTypeLabel(order.type)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-lg font-extrabold text-stone-800">
            {formatOrderTotal(order.total)}
          </div>
          <div className="text-xs text-stone-500">
            {order.items.reduce((sum, item) => sum + item.quantity, 0)} шт.
          </div>
        </div>
      </div>

      <ul className="mt-3 rounded-sm border border-stone-200 bg-stone-50 p-3 text-sm">
        {order.items.map((item, index) => (
          <li
            key={`${item.sku}-${index}`}
            className="flex justify-between gap-4 py-0.5"
          >
            <span className="text-stone-700">
              {item.name}
              <span className="text-stone-400"> × {item.quantity}</span>
            </span>
            <span className="shrink-0 font-semibold text-stone-800">
              {(item.price * item.quantity).toLocaleString("uk-UA")} ₴
            </span>
          </li>
        ))}
      </ul>

      {isReservation(order) ? (
        <p className="mt-3 rounded-sm border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          🔖 Товар зарезервовано. Ми зв&apos;яжемося з вами, щоб узгодити
          доставку та оплату.
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="shrink-0 text-stone-500">📍 Доставка:</dt>
            <dd className="font-medium text-stone-800">
              {order.city}, {order.warehouse}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-stone-500">💳 Оплата:</dt>
            <dd className="font-medium text-stone-800">
              {paymentLabel(order.paymentMethod)}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-stone-500">📲 Зв&apos;язок:</dt>
            <dd className="font-medium text-stone-800">
              {contactChannelLabel(order.contactChannel)}
            </dd>
          </div>
        </dl>
      )}
    </li>
  );
}

export default async function AccountOrdersPage() {
  const customerId = await getCustomerId();
  if (!customerId) {
    redirect("/account/login?from=/account");
  }

  const customer = hasDatabase() ? await findCustomerById(customerId) : null;
  if (!customer) {
    // The cookie outlived the account (deleted row, or a wiped database).
    redirect("/account/login");
  }

  const [orders, favorites] = await Promise.all([
    listOrdersForCustomer(customerId, customer.email, customer.phone),
    listFavorites(customerId),
  ]);

  return (
    <AccountShell
      active="orders"
      name={customer.name}
      email={customer.email}
      orderCount={orders.length}
      favoriteCount={favorites.length}
    >
      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-sm border border-stone-200 bg-white p-10 text-center">
          <Package className="h-10 w-10 text-stone-300" aria-hidden="true" />
          <h2 className="text-lg font-bold text-stone-800">
            Замовлень поки немає
          </h2>
          <p className="max-w-md text-sm text-stone-600">
            Тут з&apos;являться ваші замовлення. Якщо ви вже замовляли раніше,
            переконайтеся, що email або телефон в акаунті збігаються з тими, які
            ви вказували при замовленні.
          </p>
          <Link
            href="/catalog"
            className="mt-2 rounded-sm bg-accent-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-accent-600"
          >
            Перейти до каталогу
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
