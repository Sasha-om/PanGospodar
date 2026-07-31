"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useCart } from "@/context/CartContext";

const novaPoshtaBranches = Array.from(
  { length: 10 },
  (_, index) => `Відділення №${index + 1}`,
);

type DeliveryMethod = "np-branch" | "np-courier";
type PaymentMethod = "cod" | "card";

export default function CheckoutPage() {
  const { items, totalItems, totalPrice, clearCart } = useCart();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>("np-branch");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const formId = useId();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearCart();
    setIsSubmitted(true);
  }

  if (isSubmitted) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center sm:px-6">
        <h1 className="text-2xl font-extrabold text-stone-800">
          Дякуємо за замовлення!
        </h1>
        <p className="text-stone-600">
          Ми зв&apos;яжемося з вами найближчим часом для підтвердження
          деталей доставки та оплати.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-sm bg-accent-500 px-6 py-3 font-bold text-white transition-colors hover:bg-accent-600"
        >
          Повернутися до каталогу
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center sm:px-6">
        <h1 className="text-2xl font-extrabold text-stone-800">
          Кошик порожній
        </h1>
        <p className="text-stone-600">
          Додайте товари в кошик, щоб оформити замовлення.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-sm bg-accent-500 px-6 py-3 font-bold text-white transition-colors hover:bg-accent-600"
        >
          Перейти до каталогу
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-stone-800">
        Оформлення замовлення
      </h1>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]"
      >
        <div className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-4 rounded-sm border border-stone-200 bg-white p-5">
            <legend className="px-1 text-sm font-bold uppercase tracking-wide text-stone-800">
              Контактні дані
            </legend>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${formId}-name`}
                className="text-sm font-semibold text-stone-700"
              >
                Ім&apos;я
              </label>
              <input
                id={`${formId}-name`}
                name="name"
                type="text"
                required
                placeholder="Ваше ім'я"
                className="rounded-sm border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${formId}-phone`}
                className="text-sm font-semibold text-stone-700"
              >
                Телефон
              </label>
              <input
                id={`${formId}-phone`}
                name="phone"
                type="tel"
                required
                placeholder="+380 XX XXX XX XX"
                className="rounded-sm border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none"
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4 rounded-sm border border-stone-200 bg-white p-5">
            <legend className="px-1 text-sm font-bold uppercase tracking-wide text-stone-800">
              Спосіб доставки
            </legend>

            <label className="flex items-center gap-2 text-sm text-stone-800">
              <input
                type="radio"
                name="delivery"
                className="h-4 w-4 accent-accent-500"
                checked={deliveryMethod === "np-branch"}
                onChange={() => setDeliveryMethod("np-branch")}
              />
              Нова Пошта — у відділення
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-800">
              <input
                type="radio"
                name="delivery"
                className="h-4 w-4 accent-accent-500"
                checked={deliveryMethod === "np-courier"}
                onChange={() => setDeliveryMethod("np-courier")}
              />
              Нова Пошта — кур&apos;єром за адресою
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${formId}-city`}
                  className="text-sm font-semibold text-stone-700"
                >
                  Місто
                </label>
                <input
                  id={`${formId}-city`}
                  name="city"
                  type="text"
                  required
                  placeholder="Ваше місто"
                  className="rounded-sm border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none"
                />
              </div>

              {deliveryMethod === "np-branch" ? (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`${formId}-branch`}
                    className="text-sm font-semibold text-stone-700"
                  >
                    Відділення Нової Пошти
                  </label>
                  <select
                    id={`${formId}-branch`}
                    name="branch"
                    required
                    defaultValue=""
                    className="rounded-sm border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none"
                  >
                    <option value="" disabled>
                      Оберіть відділення
                    </option>
                    {novaPoshtaBranches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`${formId}-address`}
                    className="text-sm font-semibold text-stone-700"
                  >
                    Адреса доставки
                  </label>
                  <input
                    id={`${formId}-address`}
                    name="address"
                    type="text"
                    required
                    placeholder="Вулиця, будинок, квартира"
                    className="rounded-sm border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-sm border border-stone-200 bg-white p-5">
            <legend className="px-1 text-sm font-bold uppercase tracking-wide text-stone-800">
              Спосіб оплати
            </legend>

            <label className="flex items-center gap-2 text-sm text-stone-800">
              <input
                type="radio"
                name="payment"
                className="h-4 w-4 accent-accent-500"
                checked={paymentMethod === "cod"}
                onChange={() => setPaymentMethod("cod")}
              />
              Оплата при отриманні
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-800">
              <input
                type="radio"
                name="payment"
                className="h-4 w-4 accent-accent-500"
                checked={paymentMethod === "card"}
                onChange={() => setPaymentMethod("card")}
              />
              Оплата карткою онлайн
            </label>
          </fieldset>
        </div>

        <div className="h-fit rounded-sm border border-stone-800 bg-stone-950 p-6 text-white">
          <h2 className="text-lg font-bold uppercase tracking-wide">
            Ваше замовлення
          </h2>

          <ul className="mt-4 flex flex-col gap-2 border-b border-stone-700 pb-4 text-sm text-stone-300">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4">
                <span>
                  {item.name} × {item.quantity}
                </span>
                <span className="shrink-0 font-semibold text-white">
                  {(item.price * item.quantity).toLocaleString("uk-UA")} ₴
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between text-sm text-stone-300">
            <span>Товарів у кошику</span>
            <span>{totalItems}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-stone-700 pt-2 text-xl font-extrabold">
            <span>До сплати</span>
            <span>{totalPrice.toLocaleString("uk-UA")} ₴</span>
          </div>

          <button
            type="submit"
            className="mt-6 w-full rounded-sm bg-accent-500 px-6 py-3 text-base font-bold text-white transition-colors hover:bg-accent-600"
          >
            Підтвердити замовлення
          </button>
        </div>
      </form>
    </div>
  );
}
