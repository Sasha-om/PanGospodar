"use server";

/**
 * Public review submission.
 *
 * A Server Action is an open POST endpoint, so everything here treats the
 * request as hostile: the honeypot and the per-IP limits run before anything
 * is written, and a submission is only ever stored as `PENDING`.
 */

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { loadProducts } from "@/lib/catalog";
import {
  countRecentReviewsByIp,
  createReview,
  ensureReviewsSchema,
  hasDatabase,
  hasRecentReviewForProduct,
} from "@/lib/db";
import {
  BODY_MAX,
  BODY_MIN,
  HONEYPOT_FIELD,
  NAME_MAX,
  NAME_MIN,
  RATE_LIMIT,
  normalizeBody,
  normalizeText,
  parseRating,
} from "@/lib/reviews";

export interface ReviewFormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Hash the caller's IP so the rate limiter can recognise a repeat visitor
 * without the database ever holding an address.
 *
 * Salted with `SESSION_SECRET`, which is already required in production, so
 * the stored digests are useless if the table ever leaks.
 */
async function clientIpHash(): Promise<string> {
  const headerList = await headers();
  // `x-forwarded-for` is a client-controlled list; the left-most entry is the
  // original client, and on Vercel the platform rewrites it, so it is
  // trustworthy there. Fall back to the platform's own header.
  const forwarded = headerList.get("x-forwarded-for") ?? "";
  const ip =
    forwarded.split(",")[0]?.trim() ||
    headerList.get("x-real-ip")?.trim() ||
    "";

  if (!ip) {
    // No address to key on — return empty, and the limiter skips this caller
    // rather than lumping every anonymous request into one bucket.
    return "";
  }
  const salt = process.env.SESSION_SECRET ?? "pangospodar-reviews";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export async function submitReview(
  _prevState: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const text = (key: string) => String(formData.get(key) ?? "").trim();

  // 1. Honeypot. Answer exactly as we would on success: a bot that can tell
  //    it was caught is a bot that can be tuned to get through.
  if (text(HONEYPOT_FIELD)) {
    console.warn("[reviews] Honeypot triggered — submission dropped");
    return { ok: true };
  }

  const productId = text("productId");
  const authorName = normalizeText(text("authorName"));
  const body = normalizeBody(String(formData.get("body") ?? ""));
  const rating = parseRating(text("rating"));

  const fieldErrors: Record<string, string> = {};

  if (authorName.length < NAME_MIN) {
    fieldErrors.authorName = "Вкажіть ім'я (щонайменше 2 символи).";
  } else if (authorName.length > NAME_MAX) {
    fieldErrors.authorName = `Ім'я задовге (максимум ${NAME_MAX} символів).`;
  }

  if (rating === null) {
    fieldErrors.rating = "Поставте оцінку від 1 до 5 зірок.";
  }

  if (body.length < BODY_MIN) {
    fieldErrors.body = `Відгук закороткий (щонайменше ${BODY_MIN} символів).`;
  } else if (body.length > BODY_MAX) {
    fieldErrors.body = `Відгук задовгий (максимум ${BODY_MAX} символів).`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Перевірте заповнені поля.", fieldErrors };
  }

  if (!hasDatabase()) {
    console.error("[reviews] No database configured — cannot save review");
    return {
      error: "Сервер тимчасово не може прийняти відгук. Спробуйте пізніше.",
    };
  }

  // 2. The product must exist, and its SKU is resolved server-side so a review
  //    cannot be attached to an arbitrary string.
  const { products } = await loadProducts();
  const product = products.find((item) => item.id === productId);
  if (!product) {
    return { error: "Товар не знайдено. Оновіть сторінку та спробуйте ще раз." };
  }
  const productSku = product.sku ?? product.id;

  try {
    await ensureReviewsSchema();

    // 3. Per-IP limits. Skipped when there is no address to key on.
    const ipHash = await clientIpHash();
    if (ipHash) {
      const recent = await countRecentReviewsByIp(ipHash, 1);
      if (recent >= RATE_LIMIT.perHour) {
        return {
          error:
            "Ви залишили забагато відгуків за останню годину. Спробуйте пізніше.",
        };
      }

      const duplicate = await hasRecentReviewForProduct(
        ipHash,
        productSku,
        RATE_LIMIT.perProductHours,
      );
      if (duplicate) {
        return {
          error: "Ви вже залишили відгук про цей товар. Дякуємо!",
        };
      }
    }

    const review = await createReview({
      productSku,
      authorName,
      rating: rating!,
      body,
      ipHash,
    });
    console.info(
      `[reviews] Review #${review.id} for ${productSku} awaiting moderation`,
    );

    // Show the new item in the moderation queue without a manual refresh.
    revalidatePath("/admin/reviews");

    return { ok: true };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[reviews] Failed to save review: ${message}`);
    return { error: "Не вдалося зберегти відгук. Спробуйте ще раз." };
  }
}
