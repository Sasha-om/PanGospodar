"use client";

import { useState } from "react";
import { useCart, type CartProduct } from "@/context/CartContext";

/**
 * Secondary next to "Купити" on the product page: the cart is the slower path,
 * so it reads as an outline rather than a second filled call to action.
 */
const buttonClass =
  "w-full rounded-sm border-2 border-accent-500 bg-white px-6 py-3 text-base font-bold text-accent-600 transition-colors hover:bg-accent-50 disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400 disabled:hover:bg-white sm:w-auto";

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
        className={buttonClass}
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
