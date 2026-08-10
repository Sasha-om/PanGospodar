"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  updateStoreSettings,
  type StoreSettingsState,
} from "@/app/actions/store-settings";
import {
  DEFAULT_STORE_SETTINGS,
  STORE_SETTINGS_FIELDS,
  type StoreSettings,
} from "@/lib/store-settings";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-graphite-200 px-3 py-2 text-sm text-graphite-900 focus:border-accent-500 focus:outline-none";
const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-graphite-500";

/**
 * Store contact details, editable and actually persisted.
 *
 * The admin panel is a client component, so the current values are fetched
 * from /api/admin/settings; saving goes through a Server Action that writes to
 * Postgres and revalidates the site.
 */
export default function StoreSettingsForm() {
  const [state, formAction, isPending] = useActionState<
    StoreSettingsState,
    FormData
  >(updateStoreSettings, {});

  /** null until the current values arrive — inputs stay disabled meanwhile. */
  const [values, setValues] = useState<StoreSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/settings", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { settings: StoreSettings };
        setValues(data.settings);
      })
      .catch((caught: unknown) => {
        if ((caught as Error)?.name === "AbortError") return;
        console.error("[admin/settings] Load failed:", caught);
        // Still let the admin edit and save — show the defaults meanwhile.
        setValues(DEFAULT_STORE_SETTINGS);
        setLoadError(
          "Не вдалося завантажити збережені значення — показано типові.",
        );
      });
    return () => controller.abort();
  }, []);

  function setField(key: keyof StoreSettings, value: string) {
    setValues((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <section className="rounded-xl border border-graphite-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold text-graphite-950">
        Налаштування магазину
      </h2>
      <p className="mt-1 text-sm text-graphite-500">
        Ці дані показуються в шапці, підвалі та на сторінці «Контакти».
      </p>

      {loadError ? (
        <p className="mt-4 rounded-lg border-l-4 border-accent-500 bg-accent-50 px-4 py-2.5 text-sm text-graphite-700">
          {loadError}
        </p>
      ) : null}

      {state.message ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-4 rounded-lg border-l-4 px-4 py-2.5 text-sm font-semibold ${
            state.ok
              ? "border-emerald-500 bg-emerald-50 text-emerald-800"
              : "border-red-500 bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <form action={formAction} className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {STORE_SETTINGS_FIELDS.map((field) => {
          const error = state.fieldErrors?.[field.key];
          return (
            <div key={field.key} className={field.wide ? "sm:col-span-2" : ""}>
              <label htmlFor={`store-${field.key}`} className={labelClass}>
                {field.label}
              </label>
              <input
                id={`store-${field.key}`}
                name={field.key}
                type="text"
                maxLength={field.maxLength}
                value={values ? values[field.key] : ""}
                disabled={values === null || isPending}
                onChange={(event) => setField(field.key, event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={`store-${field.key}-hint`}
                className={`${inputClass} ${
                  error ? "border-red-400" : ""
                } disabled:bg-graphite-50 disabled:text-graphite-400`}
              />
              <p
                id={`store-${field.key}-hint`}
                className={`mt-1 text-xs ${
                  error ? "font-semibold text-red-600" : "text-graphite-500"
                }`}
              >
                {error ?? field.hint}
              </p>
            </div>
          );
        })}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={values === null || isPending}
            className="flex items-center gap-2 rounded-lg bg-accent-500 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {isPending ? "Збереження…" : "Зберегти зміни"}
          </button>
        </div>
      </form>
    </section>
  );
}
