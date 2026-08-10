"use server";

import { revalidatePath, updateTag } from "next/cache";
import { verifySession } from "@/lib/dal";
import {
  STORE_SETTINGS_TAG,
  ensureSettingsTable,
  hasDatabase,
  saveStoreSettings as writeStoreSettings,
} from "@/lib/db";
import {
  STORE_SETTINGS_FIELDS,
  normalizeStoreSettings,
  type StoreSettings,
} from "@/lib/store-settings";

export interface StoreSettingsState {
  ok?: boolean;
  message?: string;
  /** Field-level messages keyed by setting name. */
  fieldErrors?: Partial<Record<keyof StoreSettings, string>>;
  /** Echoed back so the form keeps what the admin typed after a failure. */
  values?: StoreSettings;
}

/**
 * Persist the store contact details and make the site pick them up.
 *
 * The header and footer live in the root layout, so a change touches every
 * page: the tag invalidates the cached read, and revalidating the root layout
 * drops the prerendered HTML that embedded the old values. Without the second
 * call the statically generated pages would keep serving stale contacts.
 */
export async function updateStoreSettings(
  _prevState: StoreSettingsState,
  formData: FormData,
): Promise<StoreSettingsState> {
  // Redirects to /login when the session is missing or expired.
  await verifySession();

  const submitted = Object.fromEntries(
    STORE_SETTINGS_FIELDS.map((field) => [
      field.key,
      String(formData.get(field.key) ?? "").trim(),
    ]),
  ) as Record<keyof StoreSettings, string>;

  const fieldErrors: Partial<Record<keyof StoreSettings, string>> = {};
  for (const field of STORE_SETTINGS_FIELDS) {
    const value = submitted[field.key];
    if (!value) {
      fieldErrors[field.key] = "Поле не може бути порожнім.";
    } else if (value.length > field.maxLength) {
      fieldErrors[field.key] = `Максимум ${field.maxLength} символів.`;
    }
  }
  if (submitted.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitted.email)) {
    fieldErrors.email = "Некоректна email-адреса.";
  }

  // Keep the typed values so a validation failure does not clear the form.
  const values = normalizeStoreSettings(submitted);

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Перевірте заповнені поля.", fieldErrors, values };
  }
  if (!hasDatabase()) {
    return {
      ok: false,
      message: "База даних не налаштована — налаштування не збережено.",
      values,
    };
  }

  try {
    await ensureSettingsTable();
    await writeStoreSettings(values);
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught);
    console.error(`[settings] Save failed: ${detail}`);
    return {
      ok: false,
      message: "Не вдалося зберегти налаштування. Спробуйте ще раз.",
      values,
    };
  }

  // `updateTag`, not `revalidateTag`: the latter is stale-while-revalidate in
  // Next 16, which would keep serving the old contacts for another visit.
  updateTag(STORE_SETTINGS_TAG);
  revalidatePath("/", "layout");

  return {
    ok: true,
    message: "Налаштування збережено — зміни вже на сайті.",
    values,
  };
}
