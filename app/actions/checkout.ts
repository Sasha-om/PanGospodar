"use server";

import { createOrder, ensureOrdersTable, hasDatabase } from "@/lib/db";
import { notifyNewOrder } from "@/lib/notifications";
import {
  CONTACT_CHANNELS,
  PAYMENT_METHODS,
  normalizePhone,
  type ContactChannel,
  type OrderItem,
  type PaymentMethod,
} from "@/lib/orders";

export interface CheckoutState {
  ok?: boolean;
  orderId?: number;
  error?: string;
  /** Field-level messages keyed by input name. */
  fieldErrors?: Record<string, string>;
}

const MAX_ITEMS = 200;

function isPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHODS.some((method) => method.value === value);
}

function isContactChannel(value: string): value is ContactChannel {
  return CONTACT_CHANNELS.some((channel) => channel.value === value);
}

/** Items come from the client cart, so prices/quantities are re-validated. */
function parseItems(raw: string): OrderItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .slice(0, MAX_ITEMS)
    .map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      const quantity = Math.max(1, Math.round(Number(item.quantity) || 0));
      const price = Math.max(0, Number(item.price) || 0);
      return {
        sku: String(item.sku ?? item.id ?? "").trim(),
        name: String(item.name ?? "").trim(),
        price,
        quantity,
      };
    })
    .filter((item) => item.name && item.quantity > 0);
}

export async function submitOrder(
  _prevState: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const text = (key: string) => String(formData.get(key) ?? "").trim();

  const firstName = text("firstName");
  const lastName = text("lastName");
  const rawPhone = text("phone");
  const email = text("email");
  const contactChannel = text("contactChannel");
  const city = text("city");
  const warehouse = text("warehouse");
  const paymentMethod = text("paymentMethod");
  const comment = text("comment");
  const items = parseItems(String(formData.get("items") ?? "[]"));

  const fieldErrors: Record<string, string> = {};

  if (!firstName) fieldErrors.firstName = "Вкажіть ім'я.";
  if (!lastName) fieldErrors.lastName = "Вкажіть прізвище.";

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    fieldErrors.phone = "Вкажіть номер у форматі +380 XX XXX XX XX.";
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "Некоректна email-адреса.";
  }
  // Without a phone call the customer must be reachable some other way.
  if (contactChannel === "email" && !email) {
    fieldErrors.email = "Для підтвердження без дзвінка вкажіть email.";
  }

  if (!isContactChannel(contactChannel)) {
    fieldErrors.contactChannel = "Оберіть спосіб зв'язку.";
  }
  if (!city) fieldErrors.city = "Оберіть місто зі списку.";
  if (!warehouse) fieldErrors.warehouse = "Оберіть відділення.";
  if (!isPaymentMethod(paymentMethod)) {
    fieldErrors.paymentMethod = "Оберіть спосіб оплати.";
  }

  if (items.length === 0) {
    return { error: "Кошик порожній — додайте товари перед оформленням." };
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Перевірте заповнені поля.", fieldErrors };
  }

  // Recomputed server-side: never trust a total sent by the browser.
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  if (!hasDatabase()) {
    console.error("[checkout] No database configured — cannot save order");
    return {
      error:
        "Сервер тимчасово не може прийняти замовлення. Зателефонуйте нам, будь ласка.",
    };
  }

  try {
    await ensureOrdersTable();
    const order = await createOrder({
      firstName,
      lastName,
      phone: phone!,
      email,
      contactChannel: contactChannel as ContactChannel,
      city,
      warehouse,
      paymentMethod: paymentMethod as PaymentMethod,
      comment,
      items,
      total,
    });

    // The order is saved; notifications are best-effort and never block it.
    const results = await notifyNewOrder(order);
    for (const result of results) {
      if (!result.ok && !result.skipped) {
        console.error(
          `[checkout] Order #${order.id} saved but ${result.channel} failed: ${result.error}`,
        );
      }
    }

    return { ok: true, orderId: order.id };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[checkout] Failed to save order: ${message}`);
    return {
      error:
        "Не вдалося зберегти замовлення. Спробуйте ще раз або зателефонуйте нам.",
    };
  }
}
