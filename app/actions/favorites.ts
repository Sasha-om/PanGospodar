"use server";

/**
 * Favourites for signed-in customers.
 *
 * Guests keep their list in `localStorage` (see `FavoritesContext`); these
 * actions are only reached once there is a session, and every one of them
 * re-reads that session rather than trusting a customer id from the client.
 */

import { revalidatePath } from "next/cache";
import { getCustomerId } from "@/lib/customer-session";
import {
  addFavorite,
  ensureCustomersSchema,
  hasDatabase,
  listFavorites,
  mergeFavorites,
  removeFavorite,
} from "@/lib/db";

export interface FavoriteResult {
  ok: boolean;
  /** The server's list after the change, so the client can resynchronise. */
  skus?: string[];
  error?: string;
}

/** Product codes are short and opaque; anything else is not one. */
function cleanSku(raw: string): string {
  return raw.trim().slice(0, 100);
}

export async function toggleFavorite(
  productSku: string,
  desired: boolean,
): Promise<FavoriteResult> {
  const customerId = await getCustomerId();
  if (!customerId) {
    // Not an error: a guest's heart is stored in the browser instead.
    return { ok: false, error: "not-signed-in" };
  }
  const sku = cleanSku(String(productSku ?? ""));
  if (!sku) {
    return { ok: false, error: "Некоректний товар." };
  }
  if (!hasDatabase()) {
    return { ok: false, error: "Сервер тимчасово недоступний." };
  }

  try {
    await ensureCustomersSchema();
    if (desired) {
      await addFavorite(customerId, sku);
    } else {
      await removeFavorite(customerId, sku);
    }
    revalidatePath("/account/favorites");
    return { ok: true, skus: await listFavorites(customerId) };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[favorites] Toggle failed: ${message}`);
    return { ok: false, error: "Не вдалося зберегти. Спробуйте ще раз." };
  }
}

/**
 * Fold a guest list into the account and return the union.
 *
 * Called by the client right after a sign-in that happened without a form
 * (a session restored on another tab, say), so the two lists cannot diverge.
 */
export async function syncFavorites(skus: string[]): Promise<FavoriteResult> {
  const customerId = await getCustomerId();
  if (!customerId) {
    return { ok: false, error: "not-signed-in" };
  }
  if (!hasDatabase()) {
    return { ok: false, error: "Сервер тимчасово недоступний." };
  }

  try {
    await ensureCustomersSchema();
    const incoming = Array.isArray(skus)
      ? skus.filter((s): s is string => typeof s === "string").map(cleanSku).filter(Boolean).slice(0, 200)
      : [];
    if (incoming.length > 0) {
      await mergeFavorites(customerId, incoming);
    }
    revalidatePath("/account/favorites");
    return { ok: true, skus: await listFavorites(customerId) };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[favorites] Sync failed: ${message}`);
    return { ok: false, error: "Не вдалося синхронізувати обране." };
  }
}
