"use client";

import { Minus, Plus } from "lucide-react";

/** Shared look for the inputs in both product-page order modals. */
export const fieldClass =
  "w-full rounded-sm border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/40";

export const labelClass = "text-sm font-semibold text-stone-700";

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-600">{message}</p>;
}

export function Required() {
  return <span className="text-accent-600">*</span>;
}

/**
 * The product being ordered, with a stepper for the quantity and a running
 * line total. `quantity` is submitted as a plain form field.
 */
export function ProductLine({
  name,
  price,
  quantity,
  max,
  onQuantityChange,
  error,
}: {
  name: string;
  price: number;
  quantity: number;
  /** Units on hand; `undefined` when the accounting system reported none. */
  max?: number;
  onQuantityChange: (next: number) => void;
  error?: string;
}) {
  const ceiling = typeof max === "number" ? Math.max(1, max) : 999;

  function clamp(next: number) {
    return Math.min(ceiling, Math.max(1, next));
  }

  return (
    <div className="rounded-sm border border-stone-200 bg-stone-50 p-4">
      <p className="font-bold text-stone-800">{name}</p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-600">Кількість</span>
          <div className="flex items-center rounded-sm border border-stone-300 bg-white">
            <button
              type="button"
              aria-label="Зменшити кількість"
              disabled={quantity <= 1}
              onClick={() => onQuantityChange(clamp(quantity - 1))}
              className="px-2.5 py-2 text-stone-600 transition-colors hover:text-accent-600 disabled:cursor-not-allowed disabled:text-stone-300"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              name="quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={ceiling}
              value={quantity}
              aria-label="Кількість"
              onChange={(event) => {
                const next = Number(event.target.value);
                onQuantityChange(Number.isFinite(next) ? clamp(next) : 1);
              }}
              className="w-14 border-x border-stone-300 py-2 text-center text-sm font-bold text-stone-800 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-accent-500/40"
            />
            <button
              type="button"
              aria-label="Збільшити кількість"
              disabled={quantity >= ceiling}
              onClick={() => onQuantityChange(clamp(quantity + 1))}
              className="px-2.5 py-2 text-stone-600 transition-colors hover:text-accent-600 disabled:cursor-not-allowed disabled:text-stone-300"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="text-right">
          <div className="text-lg font-extrabold text-stone-800">
            {(price * quantity).toLocaleString("uk-UA")} ₴
          </div>
          {quantity > 1 ? (
            <div className="text-xs text-stone-500">
              {price.toLocaleString("uk-UA")} ₴ × {quantity}
            </div>
          ) : null}
        </div>
      </div>

      {typeof max === "number" ? (
        <p className="mt-2 text-xs text-stone-500">В наявності: {max} шт.</p>
      ) : null}
      <FieldError message={error} />
    </div>
  );
}

/** Error banner shown above the submit button. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
    >
      {message}
    </p>
  );
}
