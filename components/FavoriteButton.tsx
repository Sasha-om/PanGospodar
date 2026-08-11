"use client";

import { Heart } from "lucide-react";
import { useFavorites } from "@/context/FavoritesContext";

/**
 * The heart toggle. Works signed out — a guest's list is kept in the browser
 * and merged into the account on the next sign-in.
 *
 * `card` overlays the product image; `full` is the labelled button used on the
 * product page next to the order actions.
 */
export default function FavoriteButton({
  sku,
  variant = "card",
}: {
  sku: string;
  variant?: "card" | "full";
}) {
  const { isFavorite, toggle, ready } = useFavorites();
  const active = isFavorite(sku);

  // Before storage is read the server-rendered state is "not favourited";
  // rendering the real state too early would flash the wrong icon.
  const on = ready && active;
  const label = on ? "Прибрати з улюблених" : "Додати в улюблені";

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={() => toggle(sku)}
        aria-pressed={on}
        title={label}
        className={`flex items-center justify-center gap-2 rounded-sm border-2 px-5 py-3 text-sm font-bold transition-colors ${
          on
            ? "border-red-500 bg-red-50 text-red-600 hover:bg-red-100"
            : "border-stone-300 text-stone-700 hover:border-red-400 hover:text-red-600"
        }`}
      >
        <Heart
          className={`h-5 w-5 ${on ? "fill-red-500 text-red-500" : ""}`}
          aria-hidden="true"
        />
        {on ? "В улюблених" : "В улюблені"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        // The card is wrapped in a link — the heart must not navigate.
        event.preventDefault();
        event.stopPropagation();
        toggle(sku);
      }}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white/90 shadow-sm backdrop-blur transition-colors hover:bg-white"
    >
      <Heart
        className={`h-5 w-5 transition-colors ${
          on ? "fill-red-500 text-red-500" : "text-stone-400 hover:text-red-500"
        }`}
        aria-hidden="true"
      />
    </button>
  );
}
