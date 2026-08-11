"use client";

import { useActionState, useEffect, useState } from "react";
import {
  submitReservation,
  type ProductOrderState,
} from "@/app/actions/product-order";
import ProductModal from "@/components/product/ProductModal";
import {
  FieldError,
  FormError,
  ProductLine,
  Required,
  fieldClass,
  labelClass,
} from "@/components/product/OrderFormParts";

const initialState: ProductOrderState = {};

export default function ReserveModal({
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
    submitReservation,
    initialState,
  );
  const [quantity, setQuantity] = useState(1);
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok && state.orderId) {
      onSuccess(state.orderId);
    }
  }, [state.ok, state.orderId, onSuccess]);

  return (
    <ProductModal
      title="Резервування товару"
      subtitle="Ми відкладемо товар для вас і зателефонуємо, щоб узгодити доставку та оплату."
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="reserve-firstName" className={labelClass}>
              Ім&apos;я <Required />
            </label>
            <input
              id="reserve-firstName"
              name="firstName"
              type="text"
              required
              autoComplete="name"
              className={fieldClass}
            />
            <FieldError message={errors.firstName} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="reserve-phone" className={labelClass}>
              Телефон <Required />
            </label>
            <input
              id="reserve-phone"
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
            <label htmlFor="reserve-email" className={labelClass}>
              Email
            </label>
            <input
              id="reserve-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={fieldClass}
            />
            <FieldError message={errors.email} />
          </div>
        </div>

        <FormError message={state.error} />

        <div className="flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row-reverse sm:items-center sm:justify-between">
          <button
            type="submit"
            disabled={pending}
            className="rounded-sm bg-graphite-950 px-6 py-3 text-base font-bold text-white transition-colors hover:bg-graphite-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Резервуємо…" : "Зарезервувати"}
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
