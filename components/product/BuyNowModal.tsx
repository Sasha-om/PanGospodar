"use client";

import { useActionState, useEffect, useState } from "react";
import { submitBuyNow, type ProductOrderState } from "@/app/actions/product-order";
import NovaPoshtaPicker from "@/components/checkout/NovaPoshtaPicker";
import ProductModal from "@/components/product/ProductModal";
import {
  FieldError,
  FormError,
  ProductLine,
  Required,
  fieldClass,
  labelClass,
} from "@/components/product/OrderFormParts";
import { CONTACT_CHANNELS, PAYMENT_METHODS } from "@/lib/orders";

const initialState: ProductOrderState = {};

export default function BuyNowModal({
  productId,
  name,
  price,
  stock,
  onClose,
  onSuccess,
}: {
  productId: string;
  name: string;
  price: number;
  stock?: number;
  onClose: () => void;
  onSuccess: (orderId: number) => void;
}) {
  const [state, formAction, pending] = useActionState(
    submitBuyNow,
    initialState,
  );
  const [quantity, setQuantity] = useState(1);
  const errors = state.fieldErrors ?? {};

  // Hand the saved order to the parent, which swaps this form for the
  // confirmation panel.
  useEffect(() => {
    if (state.ok && state.orderId) {
      onSuccess(state.orderId);
    }
  }, [state.ok, state.orderId, onSuccess]);

  return (
    <ProductModal
      title="Оформлення покупки"
      subtitle="Заповніть дані — ми зв'яжемося з вами для підтвердження замовлення."
      onClose={onClose}
    >
      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="productId" value={productId} />

        <ProductLine
          name={name}
          price={price}
          quantity={quantity}
          max={stock}
          onQuantityChange={setQuantity}
          error={errors.quantity}
        />

        {/* ------------------------- Customer ------------------------- */}
        <fieldset className="flex flex-col gap-4">
          <legend className="text-sm font-bold uppercase tracking-wide text-stone-800">
            Контактні дані
          </legend>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="buy-firstName" className={labelClass}>
                Ім&apos;я <Required />
              </label>
              <input
                id="buy-firstName"
                name="firstName"
                type="text"
                required
                autoComplete="given-name"
                className={fieldClass}
              />
              <FieldError message={errors.firstName} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="buy-lastName" className={labelClass}>
                Прізвище <Required />
              </label>
              <input
                id="buy-lastName"
                name="lastName"
                type="text"
                required
                autoComplete="family-name"
                className={fieldClass}
              />
              <FieldError message={errors.lastName} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="buy-phone" className={labelClass}>
                Телефон <Required />
              </label>
              <input
                id="buy-phone"
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
              <label htmlFor="buy-email" className={labelClass}>
                Email
              </label>
              <input
                id="buy-email"
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
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-bold uppercase tracking-wide text-stone-800">
            Доставка — Нова Пошта
          </legend>
          <NovaPoshtaPicker
            cityError={errors.city}
            warehouseError={errors.warehouse}
          />
        </fieldset>

        {/* --------------------- Contact channel ---------------------- */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-bold uppercase tracking-wide text-stone-800">
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
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-bold uppercase tracking-wide text-stone-800">
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor="buy-comment" className={labelClass}>
            Коментар до замовлення
          </label>
          <textarea
            id="buy-comment"
            name="comment"
            rows={2}
            placeholder="Побажання щодо доставки, часу дзвінка тощо"
            className={`${fieldClass} resize-y`}
          />
        </div>

        <FormError message={state.error} />

        <div className="flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row-reverse sm:items-center sm:justify-between">
          <button
            type="submit"
            disabled={pending}
            className="rounded-sm bg-accent-500 px-6 py-3 text-base font-bold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? "Оформлення…"
              : `Підтвердити замовлення — ${(price * quantity).toLocaleString("uk-UA")} ₴`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-stone-300 px-5 py-3 text-sm font-bold text-stone-700 transition-colors hover:bg-stone-50"
          >
            Скасувати
          </button>
        </div>
      </form>
    </ProductModal>
  );
}
