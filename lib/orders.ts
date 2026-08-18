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

/**
 * How the order reached us. All three land in the same `orders` table and the
 * same admin list — the type only changes which fields are filled in and how
 * the order is labelled.
 *
 *  - `CART`        — the full cart checkout at /checkout
 *  - `BUY_NOW`     — "Купити" on a product page: one product, same details
 *  - `RESERVATION` — "Зарезервувати": a hold on stock, with delivery and
 *                    payment left for the dealer to agree by phone
 */
export const ORDER_TYPES = [
  { value: "CART", label: "Замовлення з кошика", icon: "🛒" },
  { value: "BUY_NOW", label: "Купівля з картки товару", icon: "⚡" },
  { value: "RESERVATION", label: "Резерв товару", icon: "🔖" },
] as const;

export type OrderType = (typeof ORDER_TYPES)[number]["value"];

/**
 * Delivery and payment are a choice the customer has not made yet on a
 * reservation. They are stored empty rather than guessed, and every reader
 * (admin list, Telegram, email) omits the row when it is.
 */
export const UNSPECIFIED = "";

export const ORDER_STATUSES = [
  { value: "NEW", label: "Нове" },
  { value: "CONFIRMED", label: "Підтверджено" },
  { value: "SHIPPED", label: "Відправлено" },
  { value: "DONE", label: "Виконано" },
  { value: "CANCELLED", label: "Скасовано" },
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number]["value"];

/**
 * Does an order in this status hold a stock reservation?
 *
 * Stock is deducted the moment an order is placed and stays deducted for its
 * whole life — the goods are spoken for whether the order is new, confirmed,
 * shipped or delivered. Only a cancellation puts them back on the shelf, so
 * `CANCELLED` is the single status that releases stock.
 */
export function reservesStock(status: OrderStatus): boolean {
  return status !== "CANCELLED";
}

export interface OrderItem {
  sku: string;
  name: string;
  price: number;
  quantity: number;
}

/** A product that cannot cover the quantity an order asks for. */
export interface StockShortage {
  sku: string;
  /** Empty when the SKU is not in the catalog at all. */
  name: string;
  /** Units on hand right now. */
  available: number;
  required: number;
}

/**
 * Thrown when a stock deduction would drive `products.stock` below zero. The
 * database refuses the write, so the surrounding transaction is already rolled
 * back by the time this reaches the caller — nothing has been saved.
 */
export class InsufficientStockError extends Error {
  readonly shortages: StockShortage[];

  constructor(shortages: StockShortage[]) {
    super(`Insufficient stock for ${shortages.length || "unknown"} product(s)`);
    this.name = "InsufficientStockError";
    this.shortages = shortages;
  }
}

/** Customer-facing explanation of which products ran out, and by how much. */
export function describeShortages(shortages: StockShortage[]): string {
  if (shortages.length === 0) {
    return "Товару не вистачає на складі. Оновіть кошик або зателефонуйте нам.";
  }
  const lines = shortages.map((item) => {
    const title = item.name || `код ${item.sku}`;
    return item.available > 0
      ? `«${title}» — доступно ${item.available} шт., потрібно ${item.required}`
      : `«${title}» — немає в наявності`;
  });
  return `Недостатньо товару на складі: ${lines.join("; ")}.`;
}

/**
 * Length ceilings for the free-text fields of an order.
 *
 * Nothing validated these before: the forms cap nothing, and a Server Action
 * accepts a body up to 1 MB, so a hand-built request could store a megabyte of
 * text per field — and then push it through the Telegram message and the
 * seller's email, where it does not fit either. These are generous for a real
 * Ukrainian name, settlement or branch, and bounded.
 */
export const ORDER_FIELD_MAX = {
  name: 80,
  phone: 32,
  email: 200,
  city: 120,
  warehouse: 200,
  comment: 1000,
} as const;

/** Trim and cap one field. The only place order text is length-limited. */
export function capOrderField(
  value: string,
  field: keyof typeof ORDER_FIELD_MAX,
): string {
  return value.trim().slice(0, ORDER_FIELD_MAX[field]);
}

export interface OrderInput {
  type: OrderType;
  firstName: string;
  /** Empty on reservations — that form asks for a single name only. */
  lastName: string;
  phone: string;
  email: string;
  contactChannel: ContactChannel;
  /** `UNSPECIFIED` on reservations. */
  city: string;
  /** `UNSPECIFIED` on reservations. */
  warehouse: string;
  /** `UNSPECIFIED` on reservations. */
  paymentMethod: PaymentMethod | typeof UNSPECIFIED;
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

export function orderTypeLabel(value: string): string {
  return ORDER_TYPES.find((t) => t.value === value)?.label ?? value;
}

/** A reservation has no delivery or payment to show. */
export function isReservation(order: { type: OrderType }): boolean {
  return order.type === "RESERVATION";
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
