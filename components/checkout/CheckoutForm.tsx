"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { submitOrder, type CheckoutState } from "@/app/actions/checkout";
import NovaPoshtaPicker from "@/components/checkout/NovaPoshtaPicker";
import { useCart } from "@/context/CartContext";
import { CONTACT_CHANNELS, PAYMENT_METHODS } from "@/lib/orders";

const initialState: CheckoutState = {};

const fieldClass =
  "w-full rounded-sm border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/40";
const labelClass = "text-sm font-semibold text-stone-700";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-600">{message}</p>;
}

export default function CheckoutForm() {
  const { items, totalItems, totalPrice, clearCart } = useCart();
  const [state, formAction, pending] = useActionState(submitOrder, initialState);
  const router = useRouter();

  // On success: empty the cart and hand the customer to the thank-you page.
  useEffect(() => {
    if (state.ok && state.orderId) {
      clearCart();
      router.push(`/order-success?id=${state.orderId}`);
    }
  }, [state.ok, state.orderId, clearCart, router]);

  if (items.length === 0 && !state.ok) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-sm border border-stone-200 bg-white p-10 text-center">
        <h2 className="text-xl font-bold text-stone-800">Кошик порожній</h2>
        <p className="text-stone-600">
          Додайте товари в кошик, щоб оформити замовлення.
        </p>
        <Link
          href="/catalog"
          className="rounded-sm bg-accent-500 px-6 py-3 font-bold text-white transition-colors hover:bg-accent-600"
        >
          Перейти до каталогу
        </Link>
      </div>
    );
  }

  const errors = state.fieldErrors ?? {};

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]"
    >
      {/* Cart snapshot — the server re-validates and recomputes the total. */}
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          items.map((item) => ({
            sku: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
        )}
      />

      <div className="flex flex-col gap-6">
        {/* ------------------------- Customer ------------------------- */}
        <fieldset className="flex flex-col gap-4 rounded-sm border border-stone-200 bg-white p-5">
          <legend className="px-1 text-sm font-bold uppercase tracking-wide text-stone-800">
            Контактні дані
          </legend>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="firstName" className={labelClass}>
                Ім&apos;я <span className="text-accent-600">*</span>
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                required
                autoComplete="given-name"
                className={fieldClass}
              />
              <FieldError message={errors.firstName} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="lastName" className={labelClass}>
                Прізвище <span className="text-accent-600">*</span>
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                required
                autoComplete="family-name"
                className={fieldClass}
              />
              <FieldError message={errors.lastName} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="phone" className={labelClass}>
                Телефон <span className="text-accent-600">*</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                autoComplete="tel"
                placeholder="+380 XX XXX XX XX"
                className={fieldClass}
              />
              <FieldError message={errors.phone} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={fieldClass}
              />
              <FieldError message={errors.email} />
            </div>
          </div>
        </fieldset>

        {/* ------------------------- Delivery ------------------------- */}
        <fieldset className="flex flex-col gap-4 rounded-sm border border-stone-200 bg-white p-5">
          <legend className="px-1 text-sm font-bold uppercase tracking-wide text-stone-800">
            Доставка — Нова Пошта
          </legend>
          <NovaPoshtaPicker
            cityError={errors.city}
            warehouseError={errors.warehouse}
          />
        </fieldset>

        {/* --------------------- Contact channel ---------------------- */}
        <fieldset className="flex flex-col gap-3 rounded-sm border border-stone-200 bg-white p-5">
          <legend className="px-1 text-sm font-bold uppercase tracking-wide text-stone-800">
            Бажаний спосіб зв&apos;язку
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CONTACT_CHANNELS.map((channel, index) => (
              <label
                key={channel.value}
                className="flex cursor-pointer items-center gap-2.5 rounded-sm border border-stone-200 px-3 py-2.5 text-sm text-stone-800 transition-colors hover:border-accent-500 has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50"
              >
                <input
                  type="radio"
                  name="contactChannel"
                  value={channel.value}
                  defaultChecked={index === 0}
                  className="h-4 w-4 accent-accent-500"
                />
                <span aria-hidden="true">{channel.icon}</span>
                {channel.label}
              </label>
            ))}
          </div>
          <FieldError message={errors.contactChannel} />
        </fieldset>

        {/* ------------------------- Payment -------------------------- */}
        <fieldset className="flex flex-col gap-2 rounded-sm border border-stone-200 bg-white p-5">
          <legend className="px-1 text-sm font-bold uppercase tracking-wide text-stone-800">
            Спосіб оплати
          </legend>
          {PAYMENT_METHODS.map((method, index) => (
            <label
              key={method.value}
              className="flex cursor-pointer items-center gap-2.5 rounded-sm border border-stone-200 px-3 py-2.5 text-sm text-stone-800 transition-colors hover:border-accent-500 has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50"
            >
              <input
                type="radio"
                name="paymentMethod"
                value={method.value}
                defaultChecked={index === 1}
                className="h-4 w-4 accent-accent-500"
              />
              {method.label}
            </label>
          ))}
          <FieldError message={errors.paymentMethod} />
        </fieldset>

        {/* ------------------------- Comment -------------------------- */}
        <fieldset className="flex flex-col gap-2 rounded-sm border border-stone-200 bg-white p-5">
          <legend className="px-1 text-sm font-bold uppercase tracking-wide text-stone-800">
            Коментар до замовлення
          </legend>
          <textarea
            id="comment"
            name="comment"
            rows={3}
            placeholder="Побажання щодо доставки, часу дзвінка тощо"
            className={`${fieldClass} resize-y`}
          />
        </fieldset>
      </div>

      {/* -------------------------- Summary --------------------------- */}
      <div className="h-fit rounded-sm border border-stone-200 bg-white p-5 lg:sticky lg:top-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-800">
          Ваше замовлення
        </h2>

        <ul className="mt-4 flex flex-col gap-2 border-b border-stone-200 pb-4 text-sm text-stone-600">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4">
              <span>
                {item.name} × {item.quantity}
              </span>
              <span className="shrink-0 font-semibold text-stone-800">
                {(item.price * item.quantity).toLocaleString("uk-UA")} ₴
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between text-sm text-stone-600">
          <span>Товарів у кошику</span>
          <span className="font-semibold text-stone-800">{totalItems}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-stone-200 pt-3 text-xl font-extrabold text-stone-800">
          <span>До сплати</span>
          <span>{totalPrice.toLocaleString("uk-UA")} ₴</span>
        </div>

        {state.error ? (
          <p
            role="alert"
            className="mt-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
          >
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-5 w-full rounded-sm bg-accent-500 px-6 py-3 text-base font-bold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Оформлення…" : "Підтвердити замовлення"}
        </button>

        <p className="mt-3 text-center text-xs text-stone-500">
          Натискаючи кнопку, ви погоджуєтесь, що ми зв&apos;яжемося з вами для
          підтвердження замовлення.
        </p>
      </div>
    </form>
  );
}
