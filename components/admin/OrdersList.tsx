"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Check,
  CheckCheck,
  Inbox,
  Loader2,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import {
  updateOrderStatus,
  type OrderStatusResult,
} from "@/app/actions/admin-orders";
import {
  contactChannelLabel,
  formatOrderTotal,
  orderStatusLabel,
  paymentLabel,
  type Order,
  type OrderStatus,
} from "@/lib/orders";

/**
 * Badge colours, one per status, so the state of an order is readable at a
 * glance without reading the label.
 */
const STATUS_BADGE: Record<OrderStatus, string> = {
  NEW: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  CONFIRMED: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  SHIPPED: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
  DONE: "bg-violet-100 text-violet-800 ring-1 ring-violet-200",
  CANCELLED: "bg-red-100 text-red-700 ring-1 ring-red-200",
};

type TabId = "all" | "new" | "confirmed" | "cancelled" | "done";

/** `statuses: null` means "no filter". */
const TABS: { id: TabId; label: string; statuses: OrderStatus[] | null }[] = [
  { id: "all", label: "Усі", statuses: null },
  { id: "new", label: "Нові", statuses: ["NEW"] },
  // An order that is already on its way is still a confirmed order — it lives
  // here rather than in a tab of its own, so nothing is hidden from the admin.
  { id: "confirmed", label: "Підтверджені", statuses: ["CONFIRMED", "SHIPPED"] },
  { id: "cancelled", label: "Скасовані", statuses: ["CANCELLED"] },
  { id: "done", label: "Виконані", statuses: ["DONE"] },
];

interface StatusAction {
  status: OrderStatus;
  label: string;
  icon: LucideIcon;
  className: string;
  /** Ask first — this one moves goods back into stock. */
  confirm?: boolean;
}

const ACTIONS: StatusAction[] = [
  {
    status: "CONFIRMED",
    label: "Підтвердити",
    icon: Check,
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100",
  },
  {
    status: "SHIPPED",
    label: "Відправлено",
    icon: Truck,
    className:
      "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400 hover:bg-blue-100",
  },
  {
    status: "DONE",
    label: "Виконано",
    icon: CheckCheck,
    className:
      "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400 hover:bg-violet-100",
  },
  {
    status: "CANCELLED",
    label: "Скасувати",
    icon: X,
    className:
      "border-red-200 bg-red-50 text-red-700 hover:border-red-400 hover:bg-red-100",
    confirm: true,
  },
];

/** An order waiting for the admin to confirm a cancellation. */
interface PendingCancel {
  id: number;
  label: string;
  /** The order still holds its stock, so cancelling will return it. */
  restocks: boolean;
}

export default function OrdersList({ orders }: { orders: Order[] }) {
  const [tab, setTab] = useState<TabId>("all");
  const [toast, setToast] = useState<OrderStatusResult | null>(null);
  const [pendingCancel, setPendingCancel] = useState<PendingCancel | null>(null);
  /** The card currently waiting on the server — only one action runs at a time. */
  const [busyId, setBusyId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const byStatus = new Map<string, number>();
    for (const order of orders) {
      byStatus.set(order.status, (byStatus.get(order.status) ?? 0) + 1);
    }
    return TABS.map((entry) => ({
      id: entry.id,
      count: entry.statuses
        ? entry.statuses.reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0)
        : orders.length,
    }));
  }, [orders]);

  const activeTab = TABS.find((entry) => entry.id === tab) ?? TABS[0];
  const visible = activeTab.statuses
    ? orders.filter((order) => activeTab.statuses!.includes(order.status))
    : orders;

  // Toasts clear themselves; a new result replaces the old one and restarts
  // the timer, because each result is a fresh object.
  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function applyStatus(orderId: number, status: OrderStatus) {
    setBusyId(orderId);
    startTransition(async () => {
      const result = await updateOrderStatus(orderId, status);
      setBusyId(null);
      setToast(result);
    });
  }

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
    <div>
      {/* Status filter tabs */}
      <div
        role="tablist"
        aria-label="Фільтр замовлень за статусом"
        className="flex flex-wrap gap-2 border-b border-stone-200 p-4"
      >
        {TABS.map((entry) => {
          const isActive = entry.id === tab;
          const count = counts.find((c) => c.id === entry.id)?.count ?? 0;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(entry.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                isActive
                  ? "bg-graphite-950 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {entry.label}
              <span
                className={`rounded-full px-1.5 text-xs font-semibold ${
                  isActive ? "bg-white/20" : "bg-white text-stone-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-stone-500">
          У цій категорії замовлень немає.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {visible.map((order) => {
            const busy = busyId === order.id && isPending;
            return (
              <li key={order.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-extrabold text-stone-800">
                        #{order.id}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          STATUS_BADGE[order.status] ??
                          "bg-stone-100 text-stone-600"
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
                      {order.items.reduce((sum, item) => sum + item.quantity, 0)}{" "}
                      шт.
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

                {/* Quick status controls. The button for the current status is
                    omitted — there is nothing to change. */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {ACTIONS.filter(
                    (action) => action.status !== order.status,
                  ).map((action) => {
                    const Icon = busy ? Loader2 : action.icon;
                    return (
                      <button
                        key={action.status}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (action.confirm) {
                            setPendingCancel({
                              id: order.id,
                              label: `#${order.id} — ${order.firstName} ${order.lastName}`.trim(),
                              restocks: order.status !== "CANCELLED",
                            });
                            return;
                          }
                          applyStatus(order.id, action.status);
                        }}
                        className={`flex items-center gap-2 rounded-sm border px-3.5 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${action.className}`}
                      >
                        <Icon
                          className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
                          aria-hidden="true"
                        />
                        {action.label}
                      </button>
                    );
                  })}
                  {busy ? (
                    <span className="sr-only" role="status" aria-live="polite">
                      Збереження…
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pendingCancel ? (
        <ConfirmDialog
          tone="danger"
          title="Скасувати замовлення?"
          message={
            pendingCancel.restocks
              ? `Замовлення ${pendingCancel.label} буде скасовано, а його товари повернуться на склад.`
              : `Замовлення ${pendingCancel.label} буде скасовано. Товари вже повернуто на склад раніше.`
          }
          confirmLabel="Скасувати замовлення"
          cancelLabel="Ні, залишити"
          onCancel={() => setPendingCancel(null)}
          onConfirm={() => {
            const target = pendingCancel;
            setPendingCancel(null);
            applyStatus(target.id, "CANCELLED");
          }}
        />
      ) : null}

      {/* Result of the last status change. */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 left-1/2 z-50 max-w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-sm border px-4 py-2.5 text-sm font-semibold shadow-lg ${
            toast.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
