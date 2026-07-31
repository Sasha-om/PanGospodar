"use client";

import { useState } from "react";
import { useCart, type CartProduct } from "@/context/CartContext";

export default function AddToCartButton({
  product,
  disabled = false,
}: {
  product: CartProduct;
  disabled?: boolean;
}) {
  const { addItem, getItemQuantity, isAtStockLimit } = useCart();
  const [added, setAdded] = useState(false);

  const inCart = getItemQuantity(product.id);
  const outOfStock = disabled || (typeof product.stock === "number" && product.stock <= 0);
  const atLimit = !outOfStock && isAtStockLimit(product.id, product.stock);
  const isDisabled = outOfStock || atLimit;

  function handleClick() {
    if (isDisabled) {
      return;
    }
    addItem(product);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1500);
  }

  function label() {
    if (outOfStock) return "Немає в наявності";
    if (atLimit) return "Максимальна кількість у кошику";
    if (added) return "Додано в кошик ✓";
    return "Додати в кошик";
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className="w-full rounded-sm bg-accent-500 px-6 py-4 text-lg font-bold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:hover:bg-stone-300 sm:w-auto"
      >
        {label()}
      </button>

      {inCart > 0 && !outOfStock ? (
        <p className="text-sm text-stone-500">
          У кошику: <span className="font-semibold text-stone-800">{inCart}</span>
          {typeof product.stock === "number"
            ? ` з ${product.stock} доступних`
            : null}
        </p>
      ) : null}
    </div>
  );
}
