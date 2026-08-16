"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import {
  requestPasswordReset,
  type ResetRequestState,
} from "@/app/actions/password-reset";
import TurnstileWidget from "@/components/TurnstileWidget";

const initialState: ResetRequestState = {};

/**
 * Asks for the account's email and nothing else.
 *
 * The confirmation is worded so it is true either way — the server answers the
 * same for a registered and an unregistered address, and the copy must not
 * quietly undo that by promising mail that is not coming.
 */
export default function ForgotPasswordForm({
  captchaRequired = false,
}: {
  /** Whether this address has already asked often enough to owe a challenge. */
  captchaRequired?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );
  const showCaptcha = captchaRequired || state.requireCaptcha === true;

  if (state.sent) {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-sm border border-stone-200 bg-white p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
          <MailCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-bold text-stone-800">Перевірте пошту</h2>
        <p className="text-sm text-stone-600">
          Якщо ця адреса зареєстрована в нас, ми надіслали на неї посилання для
          відновлення пароля. Воно діє одну годину.
        </p>
        <p className="text-sm text-stone-500">
          Не бачите листа? Перевірте теку «Спам».
        </p>
        <Link
          href="/account/login"
          className="text-sm font-semibold text-accent-600 transition-colors hover:text-accent-700"
        >
          Повернутися до входу
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex w-full max-w-md flex-col gap-4 rounded-sm border border-stone-200 bg-white p-6"
    >
      <p className="text-sm text-stone-600">
        Вкажіть email, з яким ви реєструвалися — ми надішлемо посилання для
        створення нового пароля.
      </p>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="reset-email"
          className="text-sm font-semibold text-stone-700"
        >
          Email <span className="text-accent-600">*</span>
        </label>
        <input
          id="reset-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full rounded-sm border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/40"
        />
      </div>

      {showCaptcha ? <TurnstileWidget /> : null}

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
        {pending ? "Надсилаємо…" : "Надіслати посилання"}
      </button>

      <p className="text-center text-sm text-stone-600">
        Згадали пароль?{" "}
        <Link
          href="/account/login"
          className="font-semibold text-accent-600 transition-colors hover:text-accent-700"
        >
          Увійти
        </Link>
      </p>
    </form>
  );
}
