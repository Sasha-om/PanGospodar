"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  resetPassword,
  type ResetPasswordState,
} from "@/app/actions/password-reset";

const initialState: ResetPasswordState = {};

/**
 * Mirrors `PASSWORD_MIN` in `lib/customers.ts`, which cannot be imported here:
 * that module pulls in `node:crypto` for hashing and would drag it into the
 * client bundle. The server validates the real rule regardless — this is only
 * the browser's early warning, exactly like the register form does it.
 */
const PASSWORD_MIN = 8;

const fieldClass =
  "w-full rounded-sm border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/40";
const labelClass = "text-sm font-semibold text-stone-700";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-600">{message}</p>;
}

/**
 * Sets a new password for the token in the URL.
 *
 * The token rides in a hidden field rather than being read from the query
 * string on the server: the action is posted, so it needs the value in the form
 * body anyway, and this keeps the whole flow in one round trip.
 */
export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    resetPassword,
    initialState,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form
      action={formAction}
      className="flex w-full max-w-md flex-col gap-4 rounded-sm border border-stone-200 bg-white p-6"
    >
      <input type="hidden" name="token" value={token} />

      <p className="text-sm text-stone-600">
        Придумайте новий пароль. Після збереження ви одразу увійдете в кабінет.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-password" className={labelClass}>
          Новий пароль <span className="text-accent-600">*</span>
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          required
          minLength={PASSWORD_MIN}
          autoComplete="new-password"
          className={fieldClass}
        />
        <p className="text-xs text-stone-500">
          Щонайменше {PASSWORD_MIN} символів.
        </p>
        <FieldError message={errors.password} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-password" className={labelClass}>
          Повторіть пароль <span className="text-accent-600">*</span>
        </label>
        <input
          id="confirm-password"
          name="confirm"
          type="password"
          required
          minLength={PASSWORD_MIN}
          autoComplete="new-password"
          className={fieldClass}
        />
        <FieldError message={errors.confirm} />
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
        {pending ? "Зберігаємо…" : "Зберегти новий пароль"}
      </button>

      <p className="text-center text-sm text-stone-600">
        <Link
          href="/account/forgot-password"
          className="font-semibold text-accent-600 transition-colors hover:text-accent-700"
        >
          Запросити нове посилання
        </Link>
      </p>
    </form>
  );
}
