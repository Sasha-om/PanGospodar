/**
 * Shared plumbing behind every way an order can arrive: the cart checkout,
 * "Купити" and "Зарезервувати" on a product page.
 *
 * Server-only. This lives outside the `"use server"` action files because a
 * module with that directive may export nothing but async functions, and these
 * helpers include types and synchronous validation.
 */

import { loadProducts } from "@/lib/catalog";
import { hashClientIp } from "@/lib/client-ip";
import { getCustomerId } from "@/lib/customer-session";
import {
  claimOrderForCustomer,
  countRecentOrdersByIp,
  createOrder,
  ensureCustomersSchema,
  ensureStockSchema,
  hasDatabase,
  updateCustomerContact,
} from "@/lib/db";
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

/**
 * `createOrder` reserves real stock the instant an order lands, for every
 * status but CANCELLED — so unlike a login guess, one "attempt" here has an
 * immediate cost (a shelf quantity, a Telegram/email notification). 5 orders
 * per 10 minutes per IP covers a real shopper retrying after a stock/field
 * error or buying twice in one visit, and blocks a script from emptying a
 * low-stock item or flooding the seller's notifications.
 */
const ORDER_RATE_LIMIT = { maxOrders: 5, windowMinutes: 10 } as const;

const TOO_MANY_ORDERS =
  "Забагато замовлень з цієї адреси за короткий час. Спробуйте пізніше або зателефонуйте нам.";

/** Upper bound on a single line, so a typo cannot reserve the whole shelf. */
export const MAX_QUANTITY = 999;

const MAX_ITEMS = 200;

/** A cart line exactly as the browser is trusted to report it: which product, how many. */
interface RawCartLine {
  sku: string;
  quantity: number;
}

/**
 * Parse the cart snapshot's shape, trusting only `sku`/`id` and `quantity`.
 *
 * Any `price`/`name` the browser sends is ignored here on purpose — those are
 * exactly the fields an edited hidden field or a hand-crafted request could
 * tamper with, and `buildLinesFromCatalog` re-resolves both from the server's
 * own catalog below.
 */
function parseCartLines(raw: string): RawCartLine[] {
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
      const quantity = Math.min(
        MAX_QUANTITY,
        Math.max(1, Math.round(Number(item.quantity) || 0)),
      );
      const sku = String(item.sku ?? item.id ?? "").trim();
      return { sku, quantity };
    })
    .filter((line) => line.sku && line.quantity > 0);
}

/**
 * Resolve a cart checkout's line items straight from the catalog.
 *
 * The browser sends only which SKUs and how many: name and price are read
 * server-side, exactly like `buildLineFromCatalog` below, so a tampered cart
 * snapshot cannot check out a chainsaw at 1 ₴. A SKU that no longer exists in
 * the catalog (deleted or renamed since it was added to the cart) is dropped
 * rather than trusted — the caller sees a shorter list, never a fabricated one.
 */
export async function buildLinesFromCatalog(raw: string): Promise<OrderItem[]> {
  const lines = parseCartLines(raw);
  if (lines.length === 0) {
    return [];
  }

  const { products } = await loadProducts();
  const bySku = new Map(products.map((product) => [product.sku ?? product.id, product]));
  const byId = new Map(products.map((product) => [product.id, product]));

  const items: OrderItem[] = [];
  for (const line of lines) {
    const product = bySku.get(line.sku) ?? byId.get(line.sku);
    if (!product) {
      continue;
    }
    items.push({
      sku: product.sku ?? product.id,
      name: product.name,
      price: product.price,
      quantity: line.quantity,
    });
  }
  return items;
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

  const ipHash = await hashClientIp("panhospodar-checkout");

  try {
    // Also installs the stock guard the deduction relies on.
    await ensureStockSchema();

    // Checked before the write: a flood of orders costs real stock the moment
    // it lands, so this has to stop the request, not just log it afterwards.
    // Fails open — a rate-limit query error must never be why a real
    // customer's order is refused.
    if (ipHash) {
      try {
        const recent = await countRecentOrdersByIp(
          ipHash,
          ORDER_RATE_LIMIT.windowMinutes,
        );
        if (recent >= ORDER_RATE_LIMIT.maxOrders) {
          return { error: TOO_MANY_ORDERS };
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        console.error(`[${logTag}] Order rate-limit check failed: ${message}`);
      }
    }

    const order = await createOrder(input, ipHash);

    // Attach the order to the account when one is signed in, so it stays in
    // the customer's history even if they later change email or phone. Never
    // allowed to fail the checkout — the order is already committed.
    try {
      const customerId = await getCustomerId();
      if (customerId) {
        await ensureCustomersSchema();
        await claimOrderForCustomer(order.id, customerId);
        await updateCustomerContact(customerId, input.firstName, input.phone);
      }
    } catch (linkError) {
      const detail =
        linkError instanceof Error ? linkError.message : String(linkError);
      console.error(`[${logTag}] Order #${order.id} saved but not linked: ${detail}`);
    }

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
