"use server";

/**
 * The two product-page order flows.
 *
 * Both write into the same `orders` table as the cart checkout and reuse the
 * same stock reservation, so an admin sees one list and stock stays honest no
 * matter which button the customer pressed.
 */

import {
  buildLineFromCatalog,
  parseQuantity,
  saveAndNotify,
  type OrderFormState,
} from "@/lib/order-intake";
import {
  CONTACT_CHANNELS,
  PAYMENT_METHODS,
  UNSPECIFIED,
  capOrderField,
  normalizePhone,
  type ContactChannel,
  type PaymentMethod,
} from "@/lib/orders";

export type ProductOrderState = OrderFormState;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHODS.some((method) => method.value === value);
}

function isContactChannel(value: string): value is ContactChannel {
  return CONTACT_CHANNELS.some((channel) => channel.value === value);
}

/** "Купити" — a full one-product checkout without going through the cart. */
export async function submitBuyNow(
  _prevState: ProductOrderState,
  formData: FormData,
): Promise<ProductOrderState> {
  const text = (key: string) => String(formData.get(key) ?? "").trim();

  const productId = text("productId");
  // Capped on the way in, like the cart checkout — same fields, same ceilings.
  const firstName = capOrderField(text("firstName"), "name");
  const lastName = capOrderField(text("lastName"), "name");
  const email = capOrderField(text("email"), "email");
  const contactChannel = text("contactChannel");
  const city = capOrderField(text("city"), "city");
  const warehouse = capOrderField(text("warehouse"), "warehouse");
  const paymentMethod = text("paymentMethod");
  const comment = capOrderField(text("comment"), "comment");

  const fieldErrors: Record<string, string> = {};

  if (!firstName) fieldErrors.firstName = "Вкажіть ім'я.";
  if (!lastName) fieldErrors.lastName = "Вкажіть прізвище.";

  const phone = normalizePhone(text("phone"));
  if (!phone) {
    fieldErrors.phone = "Вкажіть номер у форматі +380 XX XXX XX XX.";
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Некоректна email-адреса.";
  }
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

  const quantity = parseQuantity(text("quantity"));
  if (quantity === null) {
    fieldErrors.quantity = "Вкажіть кількість від 1 до 999.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Перевірте заповнені поля.", fieldErrors };
  }

  const item = await buildLineFromCatalog(productId, quantity!);
  if (!item) {
    return { error: "Товар не знайдено. Оновіть сторінку та спробуйте ще раз." };
  }

  return saveAndNotify(
    {
      type: "BUY_NOW",
      firstName,
      lastName,
      phone: phone!,
      email,
      contactChannel: contactChannel as ContactChannel,
      city,
      warehouse,
      paymentMethod: paymentMethod as PaymentMethod,
      comment,
      items: [item],
      total: item.price * item.quantity,
    },
    "buy-now",
  );
}

/**
 * "Зарезервувати" — hold the goods and let the dealer agree delivery and
 * payment on the phone. Stock moves exactly as it does for a purchase, so a
 * reservation cannot exceed what is on the shelf and is released when the
 * admin cancels the order.
 */
export async function submitReservation(
  _prevState: ProductOrderState,
  formData: FormData,
): Promise<ProductOrderState> {
  const text = (key: string) => String(formData.get(key) ?? "").trim();

  const productId = text("productId");
  const firstName = capOrderField(text("firstName"), "name");
  const email = capOrderField(text("email"), "email");

  const fieldErrors: Record<string, string> = {};

  if (!firstName) fieldErrors.firstName = "Вкажіть ім'я.";

  const phone = normalizePhone(text("phone"));
  if (!phone) {
    fieldErrors.phone = "Вкажіть номер у форматі +380 XX XXX XX XX.";
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Некоректна email-адреса.";
  }

  const quantity = parseQuantity(text("quantity"));
  if (quantity === null) {
    fieldErrors.quantity = "Вкажіть кількість від 1 до 999.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Перевірте заповнені поля.", fieldErrors };
  }

  const item = await buildLineFromCatalog(productId, quantity!);
  if (!item) {
    return { error: "Товар не знайдено. Оновіть сторінку та спробуйте ще раз." };
  }

  return saveAndNotify(
    {
      type: "RESERVATION",
      firstName,
      // The reservation form asks for one name and no delivery details — the
      // dealer fills the rest in on the call.
      lastName: "",
      phone: phone!,
      email,
      contactChannel: "phone",
      city: UNSPECIFIED,
      warehouse: UNSPECIFIED,
      paymentMethod: UNSPECIFIED,
      comment: "",
      items: [item],
      total: item.price * item.quantity,
    },
    "reservation",
  );
}
