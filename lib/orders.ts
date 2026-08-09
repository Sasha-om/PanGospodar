/**
 * Order domain types and persistence.
 *
 * Orders live in their own `orders` table. Line items are stored as JSONB
 * rather than a child table: an order is always read as a whole, the items are
 * a snapshot of names/prices at purchase time (they must NOT follow later
 * catalog edits), and this keeps reads to a single row.
 */

export const PAYMENT_METHODS = [
  { value: "privat-transfer", label: "Переказ на картку Приватбанку" },
  { value: "cod", label: "При отриманні замовлення (накладений платіж)" },
  { value: "invoice", label: "Безготівковий розрахунок (для ФОП / юр. осіб)" },
  { value: "liqpay", label: "Оплата картою Visa / Mastercard (LiqPay)" },
  { value: "privat-parts", label: "Оплата частинами — ПриватБанк" },
  { value: "mono-parts", label: "Покупка частинами — monobank" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export const CONTACT_CHANNELS = [
  { value: "phone", label: "Телефонний дзвінок", icon: "📞" },
  { value: "telegram", label: "Telegram", icon: "💬" },
  { value: "viber", label: "Viber", icon: "💬" },
  {
    value: "email",
    label: "Email / без дзвінка (підтвердити у месенджері)",
    icon: "✉️",
  },
] as const;

export type ContactChannel = (typeof CONTACT_CHANNELS)[number]["value"];

export const ORDER_STATUSES = [
  { value: "NEW", label: "Нове" },
  { value: "CONFIRMED", label: "Підтверджено" },
  { value: "SHIPPED", label: "Відправлено" },
  { value: "DONE", label: "Виконано" },
  { value: "CANCELLED", label: "Скасовано" },
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number]["value"];

export interface OrderItem {
  sku: string;
  name: string;
  price: number;
  quantity: number;
}

export interface OrderInput {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  contactChannel: ContactChannel;
  city: string;
  warehouse: string;
  paymentMethod: PaymentMethod;
  comment: string;
  items: OrderItem[];
  total: number;
}

export interface Order extends OrderInput {
  id: number;
  status: OrderStatus;
  createdAt: string;
}

export function paymentLabel(value: string): string {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value;
}

export function contactChannelLabel(value: string): string {
  const channel = CONTACT_CHANNELS.find((c) => c.value === value);
  return channel ? `${channel.icon} ${channel.label}` : value;
}

export function orderStatusLabel(value: string): string {
  return ORDER_STATUSES.find((s) => s.value === value)?.label ?? value;
}

/**
 * Ukrainian mobile number in +380XXXXXXXXX form.
 * Accepts spaces, dashes and brackets, returns the normalized value or null.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const onlyDigits = digits.replace(/\D/g, "");

  // 380XXXXXXXXX (12) | 0XXXXXXXXX (10) | XXXXXXXXX (9)
  let national: string | null = null;
  if (onlyDigits.length === 12 && onlyDigits.startsWith("380")) {
    national = onlyDigits.slice(2);
  } else if (onlyDigits.length === 10 && onlyDigits.startsWith("0")) {
    national = onlyDigits;
  } else if (onlyDigits.length === 9) {
    national = `0${onlyDigits}`;
  }

  if (!national || !/^0\d{9}$/.test(national)) {
    return null;
  }
  return `+38${national}`;
}

export function formatOrderTotal(value: number): string {
  return `${value.toLocaleString("uk-UA")} грн`;
}
