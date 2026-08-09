import { Inbox } from "lucide-react";
import {
  contactChannelLabel,
  formatOrderTotal,
  orderStatusLabel,
  paymentLabel,
  type Order,
} from "@/lib/orders";

const statusStyles: Record<string, string> = {
  NEW: "bg-accent-100 text-accent-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  SHIPPED: "bg-stone-800 text-accent-400",
  DONE: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-stone-100 text-stone-500",
};

/** Server component — renders orders already fetched by the caller. */
export default function OrdersList({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-50 text-stone-400">
          <Inbox className="h-8 w-8" aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-base font-bold text-stone-800">
          Замовлень поки немає
        </h3>
        <p className="mt-1 max-w-xs text-sm text-stone-500">
          Нові замовлення від покупців з&apos;являться тут.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-stone-200">
      {orders.map((order) => (
        <li key={order.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-extrabold text-stone-800">
                  #{order.id}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    statusStyles[order.status] ?? "bg-stone-100 text-stone-600"
                  }`}
                >
                  {orderStatusLabel(order.status)}
                </span>
                <span className="text-xs text-stone-500">
                  {new Date(order.createdAt).toLocaleString("uk-UA")}
                </span>
              </div>

              <div className="mt-1 font-semibold text-stone-800">
                {order.firstName} {order.lastName}
              </div>
              <div className="text-sm text-stone-600">
                <a
                  href={`tel:${order.phone}`}
                  className="font-medium transition-colors hover:text-accent-600"
                >
                  {order.phone}
                </a>
                {order.email ? (
                  <>
                    <span className="mx-1.5 text-stone-300">|</span>
                    <a
                      href={`mailto:${order.email}`}
                      className="transition-colors hover:text-accent-600"
                    >
                      {order.email}
                    </a>
                  </>
                ) : null}
              </div>
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

          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="shrink-0 text-stone-500">📲 Зв&apos;язок:</dt>
              <dd className="font-medium text-stone-800">
                {contactChannelLabel(order.contactChannel)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-stone-500">💳 Оплата:</dt>
              <dd className="font-medium text-stone-800">
                {paymentLabel(order.paymentMethod)}
              </dd>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <dt className="shrink-0 text-stone-500">📍 Доставка:</dt>
              <dd className="font-medium text-stone-800">
                {order.city}, {order.warehouse}
              </dd>
            </div>
            {order.comment ? (
              <div className="flex gap-2 sm:col-span-2">
                <dt className="shrink-0 text-stone-500">💬 Коментар:</dt>
                <dd className="text-stone-800">{order.comment}</dd>
              </div>
            ) : null}
          </dl>

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
        </li>
      ))}
    </ul>
  );
}
