"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/dal";
import {
  ReviewNotFoundError,
  deleteReview,
  ensureReviewsSchema,
  hasDatabase,
  setReviewStatus,
} from "@/lib/db";
import { isReviewStatus, reviewStatusLabel, type ReviewStatus } from "@/lib/reviews";

export interface ReviewActionResult {
  ok: boolean;
  message: string;
}

/**
 * Approve or reject a review.
 *
 * A Server Action is a public POST endpoint, so the session is re-checked and
 * both arguments validated — the caller sitting behind the admin layout says
 * nothing about the request that actually arrives.
 */
export async function updateReviewStatus(
  reviewId: string | number,
  newStatus: ReviewStatus,
): Promise<ReviewActionResult> {
  await verifySession();

  const id = Math.trunc(Number(reviewId));
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "Некоректний номер відгуку." };
  }
  if (!isReviewStatus(newStatus)) {
    return { ok: false, message: "Невідомий статус відгуку." };
  }
  if (!hasDatabase()) {
    return { ok: false, message: "База даних не налаштована — зміни не збережено." };
  }

  try {
    await ensureReviewsSchema();
    await setReviewStatus(id, newStatus);

    // Approving changes what shoppers see: the review list on the product page
    // and the average rating on every card that shows this product.
    revalidatePath("/admin/reviews");
    revalidatePath("/product/[id]", "page");
    revalidatePath("/catalog");
    revalidatePath("/");

    return { ok: true, message: `Відгук #${id} — ${reviewStatusLabel(newStatus)}.` };
  } catch (caught) {
    if (caught instanceof ReviewNotFoundError) {
      return { ok: false, message: `Відгук #${id} не знайдено.` };
    }
    const detail = caught instanceof Error ? caught.message : String(caught);
    console.error(`[admin/reviews] Status update for #${id} failed: ${detail}`);
    return { ok: false, message: "Не вдалося змінити статус. Спробуйте ще раз." };
  }
}

/** Remove a review outright — for spam that should not sit in the queue. */
export async function removeReview(
  reviewId: string | number,
): Promise<ReviewActionResult> {
  await verifySession();

  const id = Math.trunc(Number(reviewId));
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "Некоректний номер відгуку." };
  }
  if (!hasDatabase()) {
    return { ok: false, message: "База даних не налаштована — зміни не збережено." };
  }

  try {
    await deleteReview(id);
    revalidatePath("/admin/reviews");
    revalidatePath("/product/[id]", "page");
    revalidatePath("/catalog");
    revalidatePath("/");
    return { ok: true, message: `Відгук #${id} видалено.` };
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught);
    console.error(`[admin/reviews] Delete of #${id} failed: ${detail}`);
    return { ok: false, message: "Не вдалося видалити відгук. Спробуйте ще раз." };
  }
}
