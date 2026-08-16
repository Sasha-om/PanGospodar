"use client";

import { useActionState } from "react";
import { LockKeyhole } from "lucide-react";
import { login, type LoginState } from "@/app/actions/auth";
import TurnstileWidget from "@/components/TurnstileWidget";

const initialState: LoginState = {};

export default function LoginForm({
  from,
  totpEnabled = false,
  captchaRequired = false,
}: {
  from?: string;
  /** Whether `ADMIN_TOTP_SECRET` is configured — resolved on the server. */
  totpEnabled?: boolean;
  /**
   * Whether this address has already failed often enough to owe a challenge.
   * Resolved on the server so a reload after several misses shows the widget
   * immediately, instead of costing one more rejected attempt to learn it.
   */
  captchaRequired?: boolean;
}) {
  const [state, formAction, pending] = useActionState(login, initialState);
  const showCaptcha = captchaRequired || state.requireCaptcha === true;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-sm border border-stone-200 bg-white p-6 sm:p-8"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-accent-500/15 text-accent-500 ring-1 ring-accent-500/30">
          <LockKeyhole className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-stone-800">Вхід в адмін-панель</h2>
          <p className="text-sm text-stone-500">
            Доступ лише для адміністраторів магазину.
          </p>
        </div>
      </div>

      {from ? <input type="hidden" name="from" value={from} /> : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="username"
          className="text-xs font-semibold uppercase tracking-wide text-stone-600"
        >
          Логін
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          defaultValue="admin"
          className="rounded-sm border border-stone-200 px-3 py-2.5 text-sm text-stone-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-xs font-semibold uppercase tracking-wide text-stone-600"
        >
          Пароль
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-sm border border-stone-200 px-3 py-2.5 text-sm text-stone-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
        />
      </div>

      {totpEnabled ? (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="code"
            className="text-xs font-semibold uppercase tracking-wide text-stone-600"
          >
            Код підтвердження
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            required
            placeholder="123456"
            className="rounded-sm border border-stone-200 px-3 py-2.5 text-sm tracking-widest text-stone-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
          />
          <p className="text-xs text-stone-500">
            Шестизначний код із застосунку-автентифікатора.
          </p>
        </div>
      ) : null}

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
        className="rounded-sm bg-accent-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Вхід..." : "Увійти"}
      </button>
    </form>
  );
}
