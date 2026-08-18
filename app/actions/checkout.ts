"use server";

import {
  buildLinesFromCatalog,
  saveAndNotify,
  type OrderFormState,
} from "@/lib/order-intake";
import {
  CONTACT_CHANNELS,
  PAYMENT_METHODS,
  capOrderField,
  normalizePhone,
  type ContactChannel,
  type PaymentMethod,
} from "@/lib/orders";

export type CheckoutState = OrderFormState;

function isPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHODS.some((method) => method.value === value);
}

function isContactChannel(value: string): value is ContactChannel {
  return CONTACT_CHANNELS.some((channel) => channel.value === value);
}

export async function submitOrder(
  _prevState: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const text = (key: string) => String(formData.get(key) ?? "").trim();

  // Capped as they are read: everything below this line, including what is
  // stored and what is mailed to the seller, is then bounded by construction.
  const firstName = capOrderField(text("firstName"), "name");
  const lastName = capOrderField(text("lastName"), "name");
  const rawPhone = capOrderField(text("phone"), "phone");
  const email = capOrderField(text("email"), "email");
  const contactChannel = text("contactChannel");
  const city = capOrderField(text("city"), "city");
  const warehouse = capOrderField(text("warehouse"), "warehouse");
  const paymentMethod = text("paymentMethod");
  const comment = capOrderField(text("comment"), "comment");
  // Only sku/quantity come from the browser; name and price are resolved from
  // the live catalog below, so an edited hidden field cannot set its own price.
  const items = await buildLinesFromCatalog(String(formData.get("items") ?? "[]"));

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

  return saveAndNotify(
    {
      type: "CART",
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
    },
    "checkout",
  );
}
