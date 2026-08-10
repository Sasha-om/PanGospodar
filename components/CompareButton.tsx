"use client";

import { BarChart3, Check } from "lucide-react";
import { MAX_COMPARE_ITEMS, useCompare } from "@/context/CompareContext";

/**
 * Adds/removes a product from the comparison list.
 *
 * On a card this sits *outside* the card's `<Link>` — a button nested in an
 * anchor is invalid HTML and the click would navigate instead of toggling.
 */
export default function CompareButton({
  productId,
  variant = "icon",
}: {
  productId: string;
  /** `icon` for the corner of a product card, `full` for the product page. */
  variant?: "icon" | "full";
}) {
  const { isComparing, toggle, isFull } = useCompare();
  const active = isComparing(productId);
  const blocked = !active && isFull;

  const title = active
    ? "Прибрати з порівняння"
    : blocked
      ? `Можна порівняти щонайбільше ${MAX_COMPARE_ITEMS} товари`
      : "Додати до порівняння";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={() => toggle(productId)}
        disabled={blocked}
        title={title}
        aria-pressed={active}
        aria-label={title}
        className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
          active
            ? "border-accent-500 bg-accent-500 text-white"
            : blocked
              ? "cursor-not-allowed border-stone-200 bg-white/80 text-stone-300"
              : "border-stone-200 bg-white/90 text-stone-500 hover:border-accent-500 hover:text-accent-600"
        }`}
      >
        {active ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => toggle(productId)}
      disabled={blocked}
      aria-pressed={active}
      title={title}
      className={`flex items-center justify-center gap-2 rounded-sm border px-5 py-3 text-sm font-bold transition-colors ${
        active
          ? "border-accent-500 bg-accent-50 text-accent-700"
          : blocked
            ? "cursor-not-allowed border-stone-200 text-stone-400"
            : "border-stone-300 text-stone-800 hover:border-accent-500 hover:text-accent-600"
      }`}
    >
      {active ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <BarChart3 className="h-4 w-4" aria-hidden="true" />
      )}
      {active ? "У порівнянні" : "Порівняти"}
    </button>
  );
}
