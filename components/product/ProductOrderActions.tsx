"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { BookmarkPlus, CheckCircle2, Zap } from "lucide-react";
import BuyNowModal from "@/components/product/BuyNowModal";
import ProductModal from "@/components/product/ProductModal";
import ReserveModal from "@/components/product/ReserveModal";

type OpenModal = "buy" | "reserve" | null;

interface Confirmation {
  kind: "buy" | "reserve";
  orderId: number;
}

/**
 * "Купити" and "Зарезервувати" on the product page.
 *
 * Both open a modal, write a real order through a server action and leave the
 * cart untouched — "Додати в кошик" stays the third, independent path.
 */
export default function ProductOrderActions({
  productId,
  name,
  price,
  stock,
  disabled = false,
}: {
  productId: string;
  name: string;
  price: number;
  /** Units on hand; `undefined` when the accounting system reported none. */
  stock?: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<OpenModal>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const close = useCallback(() => setOpen(null), []);

  // Stable across renders so the modals' success effects do not re-fire.
  const onBought = useCallback((orderId: number) => {
    setOpen(null);
    setConfirmation({ kind: "buy", orderId });
  }, []);

  const onReserved = useCallback((orderId: number) => {
    setOpen(null);
    setConfirmation({ kind: "reserve", orderId });
  }, []);

  const outOfStock = disabled || (typeof stock === "number" && stock <= 0);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={outOfStock}
          onClick={() => setOpen("buy")}
          className="flex flex-1 items-center justify-center gap-2 rounded-sm bg-accent-500 px-6 py-4 text-lg font-bold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-stone-300 sm:flex-none"
        >
          <Zap className="h-5 w-5" aria-hidden="true" />
          {outOfStock ? "Немає в наявності" : "Купити"}
        </button>

        <button
          type="button"
          disabled={outOfStock}
          onClick={() => setOpen("reserve")}
          className="flex flex-1 items-center justify-center gap-2 rounded-sm border-2 border-graphite-950 px-6 py-4 text-lg font-bold text-graphite-950 transition-colors hover:bg-graphite-950 hover:text-white disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400 disabled:hover:bg-transparent disabled:hover:text-stone-400 sm:flex-none"
        >
          <BookmarkPlus className="h-5 w-5" aria-hidden="true" />
          Зарезервувати
        </button>
      </div>

      {open === "buy" ? (
        <BuyNowModal
          productId={productId}
          name={name}
          price={price}
          stock={stock}
          onClose={close}
          onSuccess={onBought}
        />
      ) : null}

      {open === "reserve" ? (
        <ReserveModal
          productId={productId}
          name={name}
          price={price}
          stock={stock}
          onClose={close}
          onSuccess={onReserved}
        />
      ) : null}

      {confirmation ? (
        <ProductModal
          title={
            confirmation.kind === "buy"
              ? "Замовлення прийнято"
              : "Товар зарезервовано"
          }
          onClose={() => setConfirmation(null)}
        >
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <CheckCircle2
              className="h-14 w-14 text-emerald-500"
              aria-hidden="true"
            />
            <p className="text-lg font-bold text-stone-800">
              Замовлення №{confirmation.orderId}
            </p>
            <p className="max-w-sm text-sm text-stone-600">
              {confirmation.kind === "buy"
                ? "Дякуємо! Ми зв'яжемося з вами найближчим часом, щоб підтвердити замовлення."
                : "Дякуємо! Товар відкладено для вас. Ми зателефонуємо, щоб узгодити спосіб доставки та оплати."}
            </p>

            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="rounded-sm bg-accent-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-accent-600"
              >
                Продовжити перегляд
              </button>
              <Link
                href="/catalog"
                className="rounded-sm border border-stone-300 px-6 py-3 text-sm font-bold text-stone-700 transition-colors hover:bg-stone-50"
              >
                До каталогу
              </Link>
            </div>
          </div>
        </ProductModal>
      ) : null}
    </>
  );
}
