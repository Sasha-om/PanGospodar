"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  loginCustomer,
  registerCustomer,
  type AuthState,
} from "@/app/actions/customer-auth";
import { readGuestFavorites } from "@/context/FavoritesContext";

const initialState: AuthState = {};

const fieldClass =
  "w-full rounded-sm border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/40";
const labelClass = "text-sm font-semibold text-stone-700";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-600">{message}</p>;
}

/**
 * Sign-in and registration share this form — the two differ only by which
 * action they post to and which extra fields they show.
 *
 * Whatever the visitor favourited before signing in rides along in a hidden
 * field, so the server can fold it into the account in the same round trip.
 */
export default function AuthForm({
  mode,
  from,
}: {
  mode: "login" | "register";
  from?: string;
}) {
  const isRegister = mode === "register";
  const [state, formAction, pending] = useActionState(
    isRegister ? registerCustomer : loginCustomer,
    initialState,
  );
  const [favorites, setFavorites] = useState("[]");
  const errors = state.fieldErrors ?? {};

  // Read after mount: the server rendered an empty list, so touching
  // localStorage during render would produce a hydration mismatch. Adopting
  // stored state on mount is exactly what this effect is for — the one render
  // it costs is the price of hydrating from an external store.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorites(JSON.stringify(readGuestFavorites()));
  }, []);

  return (
    <form
      action={formAction}
      className="flex w-full max-w-md flex-col gap-4 rounded-sm border border-stone-200 bg-white p-6"
    >
      <input type="hidden" name="favorites" value={favorites} />
      {from ? <input type="hidden" name="from" value={from} /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="account-email" className={labelClass}>
          Email <span className="text-accent-600">*</span>
        </label>
        <input
          id="account-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={fieldClass}
        />
        <FieldError message={errors.email} />
      </div>

      {isRegister ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="account-name" className={labelClass}>
              Ім&apos;я <span className="text-accent-600">*</span>
            </label>
            <input
              id="account-name"
              name="name"
              type="text"
              required
              autoComplete="name"
              className={fieldClass}
            />
            <FieldError message={errors.name} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="account-phone" className={labelClass}>
              Телефон
            </label>
            <input
              id="account-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+380 XX XXX XX XX"
              className={fieldClass}
            />
            <p className="text-xs text-stone-500">
              Вкажіть той самий номер, що й у попередніх замовленнях — тоді вони
              одразу з&apos;являться в історії.
            </p>
            <FieldError message={errors.phone} />
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="account-password" className={labelClass}>
          Пароль <span className="text-accent-600">*</span>
        </label>
        <input
          id="account-password"
          name="password"
          type="password"
          required
          minLength={isRegister ? 8 : undefined}
          autoComplete={isRegister ? "new-password" : "current-password"}
          className={fieldClass}
        />
        {isRegister ? (
          <p className="text-xs text-stone-500">Щонайменше 8 символів.</p>
        ) : (
          <Link
            href="/account/forgot-password"
            className="self-start text-xs font-semibold text-accent-600 transition-colors hover:text-accent-700"
          >
            Забули пароль?
          </Link>
        )}
        <FieldError message={errors.password} />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-sm bg-accent-500 px-6 py-3 text-base font-bold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? isRegister
            ? "Створюємо…"
            : "Входимо…"
          : isRegister
            ? "Створити акаунт"
            : "Увійти"}
      </button>

      <p className="text-center text-sm text-stone-600">
        {isRegister ? "Вже маєте акаунт? " : "Ще не маєте акаунта? "}
        <Link
          href={isRegister ? "/account/login" : "/account/register"}
          className="font-semibold text-accent-600 transition-colors hover:text-accent-700"
        >
          {isRegister ? "Увійти" : "Зареєструватися"}
        </Link>
      </p>
    </form>
  );
}
