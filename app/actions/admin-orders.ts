"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/dal";
import {
  OrderNotFoundError,
  ensureStockSchema,
  hasDatabase,
  setOrderStatus,
} from "@/lib/db";
import {
  InsufficientStockError,
  ORDER_STATUSES,
  describeShortages,
  orderStatusLabel,
  type OrderStatus,
} from "@/lib/orders";

/** Result of a status change, rendered as a toast in the admin panel. */
export interface OrderStatusResult {
  ok: boolean;
  message: string;
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return ORDER_STATUSES.some((status) => status.value === value);
}

/** How the stock side-effect is described to the admin. */
const STOCK_NOTE = {
  released: " Товари повернено на склад.",
  reserved: " Товари списано зі складу.",
  unchanged: "",
} as const;

/**
 * Change an order's status from the admin panel.
 *
 * Stock follows the status: cancelling returns the ordered quantities to the
 * catalog, re-opening a cancelled order takes them out again. `setOrderStatus`
 * does both in one transaction, so a failure here leaves nothing half-applied.
 *
 * A Server Action is a public POST endpoint, so the session is re-checked and
 * both arguments are validated — the calling component being behind the admin
 * layout proves nothing about the request that actually arrives.
 */
export async function updateOrderStatus(
  orderId: string | number,
  newStatus: OrderStatus,
): Promise<OrderStatusResult> {
  // Redirects to /login when the session is missing or expired.
  await verifySession();

  const id = Math.trunc(Number(orderId));
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "Некоректний номер замовлення." };
  }
  if (!isOrderStatus(newStatus)) {
    return { ok: false, message: "Невідомий статус замовлення." };
  }
  if (!hasDatabase()) {
    return { ok: false, message: "База даних не налаштована — статус не збережено." };
  }

  try {
    // `stock_applied` and the stock guard must exist before the first change.
    await ensureStockSchema();
    const { stock } = await setOrderStatus(id, newStatus);

    // The orders list and the admin dashboard both read from the database:
    // the first shows the new status, the second the updated stock counts.
    // (Products are managed on /admin itself — there is no /admin/products.)
    revalidatePath("/admin/orders");
    revalidatePath("/admin");

    return {
      ok: true,
      message: `Замовлення #${id} — ${orderStatusLabel(newStatus)}.${STOCK_NOTE[stock]}`,
    };
  } catch (caught) {
    if (caught instanceof InsufficientStockError) {
      // Nothing was written — the status change rolled back with the deduction.
      return {
        ok: false,
        message: `Не вдалося відновити замовлення #${id}. ${describeShortages(caught.shortages)}`,
      };
    }
    if (caught instanceof OrderNotFoundError) {
      return { ok: false, message: `Замовлення #${id} не знайдено.` };
    }
    const detail = caught instanceof Error ? caught.message : String(caught);
    console.error(`[admin/orders] Status update for #${id} failed: ${detail}`);
    return { ok: false, message: "Не вдалося змінити статус. Спробуйте ще раз." };
  }
}
