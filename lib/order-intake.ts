/**
 * Shared plumbing behind every way an order can arrive: the cart checkout,
 * "Купити" and "Зарезервувати" on a product page.
 *
 * Server-only. This lives outside the `"use server"` action files because a
 * module with that directive may export nothing but async functions, and these
 * helpers include types and synchronous validation.
 */

import { loadProducts } from "@/lib/catalog";
import { createOrder, ensureStockSchema, hasDatabase } from "@/lib/db";
import { notifyNewOrder } from "@/lib/notifications";
import {
  InsufficientStockError,
  describeShortages,
  type OrderInput,
  type OrderItem,
} from "@/lib/orders";

export interface OrderFormState {
  ok?: boolean;
  orderId?: number;
  error?: string;
  /** Field-level messages keyed by input name. */
  fieldErrors?: Record<string, string>;
}

/** Upper bound on a single line, so a typo cannot reserve the whole shelf. */
export const MAX_QUANTITY = 999;

const MAX_ITEMS = 200;

/** Cart items come from the browser, so prices/quantities are re-validated. */
export function parseItems(raw: string): OrderItem[] {
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

export function parseQuantity(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return null;
  }
  const quantity = Math.round(value);
  if (quantity < 1 || quantity > MAX_QUANTITY) {
    return null;
  }
  return quantity;
}

/**
 * Resolve one product-page line straight from the catalog.
 *
 * The browser sends only an id and a quantity: name and price are read
 * server-side so a tampered form cannot book a chainsaw at 1 ₴.
 */
export async function buildLineFromCatalog(
  productId: string,
  quantity: number,
): Promise<OrderItem | null> {
  const { products } = await loadProducts();
  const product = products.find((item) => item.id === productId);
  if (!product) {
    return null;
  }
  return {
    sku: product.sku ?? product.id,
    name: product.name,
    price: product.price,
    quantity,
  };
}

/**
 * Persist the order and tell the seller about it.
 *
 * Notifications are best-effort by design: the order is already committed, so
 * a Telegram outage must never surface as a failed checkout.
 */
export async function saveAndNotify(
  input: OrderInput,
  logTag: string,
): Promise<OrderFormState> {
  if (!hasDatabase()) {
    console.error(`[${logTag}] No database configured — cannot save order`);
    return {
      error:
        "Сервер тимчасово не може прийняти замовлення. Зателефонуйте нам, будь ласка.",
    };
  }

  try {
    // Also installs the stock guard the deduction relies on.
    await ensureStockSchema();
    const order = await createOrder(input);

    const results = await notifyNewOrder(order);
    for (const result of results) {
      if (!result.ok && !result.skipped) {
        console.error(
          `[${logTag}] Order #${order.id} saved but ${result.channel} failed: ${result.error}`,
        );
      }
    }

    return { ok: true, orderId: order.id };
  } catch (caught) {
    if (caught instanceof InsufficientStockError) {
      // The order rolled back together with the stock deduction, so the
      // customer can adjust and retry without leaving a duplicate behind.
      console.warn(
        `[${logTag}] Rejected — insufficient stock: ${caught.shortages
          .map((item) => `${item.sku} (${item.available}/${item.required})`)
          .join(", ")}`,
      );
      return {
        error: `${describeShortages(caught.shortages)} Змініть кількість або зателефонуйте нам.`,
      };
    }
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[${logTag}] Failed to save order: ${message}`);
    return {
      error:
        "Не вдалося зберегти замовлення. Спробуйте ще раз або зателефонуйте нам.",
    };
  }
}
