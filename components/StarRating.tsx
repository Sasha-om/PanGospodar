import { Star } from "lucide-react";

/**
 * Star rating display. Driven by real data — render this only when a product
 * actually carries a `rating`, so the UI never implies reviews that don't exist.
 */
export default function StarRating({
  rating,
  reviewCount,
  className = "",
}: {
  rating: number;
  reviewCount?: number;
  className?: string;
}) {
  const rounded = Math.round(rating);

  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      aria-label={`Оцінка ${rating.toFixed(1)} з 5`}
    >
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3.5 w-3.5 ${
              star <= rounded
                ? "fill-amber-400 text-amber-400"
                : "fill-stone-200 text-stone-200"
            }`}
          />
        ))}
      </span>
      <span className="text-xs font-bold text-stone-700">
        {rating.toFixed(1)}
      </span>
      {typeof reviewCount === "number" ? (
        <span className="text-xs text-stone-400">({reviewCount})</span>
      ) : null}
    </div>
  );
}
