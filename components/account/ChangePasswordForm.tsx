"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  changePassword,
  type ChangePasswordState,
} from "@/app/actions/account-password";

const initialState: ChangePasswordState = {};

/**
 * Mirrors `PASSWORD_MIN` in `lib/customers.ts`, which cannot be imported into a
 * client component — it pulls in `node:crypto` for hashing. The server enforces
 * the real rule; this is only the browser's early warning, as in the other
 * account forms.
 */
const PASSWORD_MIN = 8;

const fieldClass =
  "w-full rounded-sm border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/40";
const labelClass = "text-sm font-semibold text-stone-700";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-600">{message}</p>;
}

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    changePassword,
    initialState,
  );
  const errors = state.fieldErrors ?? {};

  if (state.changed) {
    return (
      <div className="flex w-full max-w-md flex-col items-start gap-3 rounded-sm border border-green-200 bg-green-50 p-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-bold text-stone-800">Пароль змінено</h2>
        <p className="text-sm text-stone-600">
          Наступного разу входьте з новим паролем. Усі інші пристрої, де ви були
          у цьому акаунті, вийшли з нього автоматично.
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex w-full max-w-md flex-col gap-4 rounded-sm border border-stone-200 bg-white p-6"
    >
      <p className="text-sm text-stone-600">
        Щоб змінити пароль, підтвердіть поточний. Після зміни ви залишитесь у
        кабінеті на цьому пристрої, а решта сеансів завершиться.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="current-password" className={labelClass}>
          Поточний пароль <span className="text-accent-600">*</span>
        </label>
        <input
          id="current-password"
          name="current"
          type="password"
          required
          autoComplete="current-password"
          className={fieldClass}
        />
        <FieldError message={errors.current} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="account-new-password" className={labelClass}>
          Новий пароль <span className="text-accent-600">*</span>
        </label>
        <input
          id="account-new-password"
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
        <label htmlFor="account-confirm-password" className={labelClass}>
          Повторіть новий пароль <span className="text-accent-600">*</span>
        </label>
        <input
          id="account-confirm-password"
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
        {pending ? "Зберігаємо…" : "Змінити пароль"}
      </button>
    </form>
  );
}
