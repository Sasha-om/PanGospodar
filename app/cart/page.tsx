"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/context/CartContext";

export default function CartPage() {
  const { items, removeItem, updateQuantity, totalItems, totalPrice } =
    useCart();

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-stone-800">Кошик</h1>

      {items.length === 0 ? (
        <div className="rounded-sm border border-stone-200 bg-white p-10 text-center">
          <p className="text-stone-600">Ваш кошик порожній.</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-sm bg-accent-500 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-accent-600"
          >
            Перейти до каталогу
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          <ul className="flex flex-col divide-y divide-stone-200 rounded-sm border border-stone-200">
            {items.map((item) => {
              const atMax =
                typeof item.stock === "number" && item.quantity >= item.stock;
              return (
              <li
                key={item.id}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
              >
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-sm bg-stone-50">
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                </div>

                <div className="flex flex-1 flex-col gap-1">
                  <span className="font-semibold text-stone-800">
                    {item.name}
                  </span>
                  <span className="text-sm text-stone-500">
                    {item.price.toLocaleString("uk-UA")} ₴ / шт.
                  </span>
                  {atMax ? (
                    <span className="text-xs font-semibold text-accent-600">
                      Максимальна кількість у кошику ({item.stock} шт.)
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Зменшити кількість"
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-sm border border-stone-200 font-bold text-stone-700 transition-colors hover:border-accent-500 hover:text-accent-500"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-semibold text-stone-800">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="Збільшити кількість"
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    disabled={atMax}
                    title={
                      atMax ? "Досягнуто максимальну кількість у наявності" : undefined
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-sm border border-stone-200 font-bold text-stone-700 transition-colors hover:border-accent-500 hover:text-accent-500 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-300 disabled:hover:border-stone-200 disabled:hover:text-stone-300"
                  >
                    +
                  </button>
                </div>

                <div className="w-24 shrink-0 text-left font-bold text-stone-800 sm:text-right">
                  {(item.price * item.quantity).toLocaleString("uk-UA")} ₴
                </div>

                <button
                  type="button"
                  aria-label="Видалити товар"
                  onClick={() => removeItem(item.id)}
                  className="shrink-0 self-start rounded-sm p-2 text-stone-400 transition-colors hover:bg-stone-50 hover:text-accent-600 sm:self-auto"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 6l12 12M18 6L6 18"
                    />
                  </svg>
                </button>
              </li>
              );
            })}
          </ul>

          <div className="h-fit rounded-sm border border-stone-800 bg-stone-950 p-6 text-white">
            <h2 className="text-lg font-bold uppercase tracking-wide">
              Разом
            </h2>
            <div className="mt-4 flex items-center justify-between text-sm text-stone-300">
              <span>Товарів у кошику</span>
              <span>{totalItems}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-stone-700 pt-2 text-xl font-extrabold">
              <span>До сплати</span>
              <span>{totalPrice.toLocaleString("uk-UA")} ₴</span>
            </div>
            <Link
              href="/checkout"
              className="mt-6 block w-full rounded-sm bg-accent-500 px-6 py-3 text-center text-base font-bold text-white transition-colors hover:bg-accent-600"
            >
              Оформити замовлення
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
