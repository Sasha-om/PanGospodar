import { MessageSquare, Star } from "lucide-react";
import ReviewForm from "@/components/product/ReviewForm";
import { listApprovedReviews } from "@/lib/db";
import { hasDatabase } from "@/lib/db";
import {
  MAX_RATING,
  formatReviewDate,
  reviewCountLabel,
  type Review,
} from "@/lib/reviews";

/** Static star row for a single review or the summary block. */
function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const rounded = Math.round(rating);
  const box = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return (
    <span
      className="flex items-center gap-0.5"
      aria-label={`Оцінка ${rating.toFixed(1)} з ${MAX_RATING}`}
    >
      {Array.from({ length: MAX_RATING }, (_, index) => index + 1).map((star) => (
        <Star
          key={star}
          className={`${box} ${
            star <= rounded
              ? "fill-amber-400 text-amber-400"
              : "fill-stone-200 text-stone-200"
          }`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/** How many reviews gave each score, for the 5→1 breakdown bars. */
function ratingBreakdown(reviews: Review[]): { star: number; count: number }[] {
  return [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((review) => Math.round(review.rating) === star).length,
  }));
}

/**
 * Approved reviews plus the submission form.
 *
 * Reads its own data so the product page does not have to thread reviews
 * through; only `APPROVED` rows are ever fetched, so nothing unmoderated can
 * reach the page even by mistake.
 */
export default async function ProductReviews({
  productId,
  productSku,
}: {
  productId: string;
  productSku: string;
}) {
  const reviews = hasDatabase() ? await listApprovedReviews(productSku) : [];

  const count = reviews.length;
  const average =
    count > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / count
      : 0;

  return (
    <section id="reviews" className="mt-14 scroll-mt-4">
      <h2 className="text-xl font-extrabold text-stone-800">Відгуки</h2>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-4">
          {count > 0 ? (
            <div className="flex flex-wrap items-center gap-6 rounded-sm border border-stone-200 bg-white p-5">
              <div className="text-center">
                <div className="text-4xl font-extrabold text-stone-800">
                  {average.toFixed(1)}
                </div>
                <div className="mt-1 flex justify-center">
                  <Stars rating={average} size="lg" />
                </div>
                <div className="mt-1 text-xs text-stone-500">
                  {reviewCountLabel(count)}
                </div>
              </div>

              <div className="min-w-[180px] flex-1">
                {ratingBreakdown(reviews).map((row) => (
                  <div key={row.star} className="flex items-center gap-2">
                    <span className="w-3 text-xs text-stone-500">{row.star}</span>
                    <Star
                      className="h-3 w-3 fill-amber-400 text-amber-400"
                      aria-hidden="true"
                    />
                    <span
                      className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100"
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-full bg-amber-400"
                        style={{
                          width: `${count > 0 ? (row.count / count) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <span className="w-6 text-right text-xs text-stone-500">
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-sm border border-stone-200 bg-white p-8 text-center">
              <MessageSquare
                className="h-8 w-8 text-stone-300"
                aria-hidden="true"
              />
              <p className="font-bold text-stone-800">Відгуків поки немає</p>
              <p className="text-sm text-stone-500">
                Станьте першим, хто поділиться враженнями про цей товар.
              </p>
            </div>
          )}

          <ul className="flex flex-col gap-3">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="rounded-sm border border-stone-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-stone-800">
                    {review.authorName}
                  </span>
                  <span className="text-xs text-stone-500">
                    {formatReviewDate(review.createdAt)}
                  </span>
                </div>
                <div className="mt-1">
                  <Stars rating={review.rating} />
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-700">
                  {review.body}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="h-fit lg:sticky lg:top-4">
          <ReviewForm productId={productId} />
        </div>
      </div>
    </section>
  );
}
