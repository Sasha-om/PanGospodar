/**
 * Store contact details editable from the admin panel.
 *
 * These used to be hard-coded in the header, footer and contacts page. They now
 * live in the `store_settings` table, and every place that displays them reads
 * from here so a change in the admin panel shows up on the site.
 *
 * This module is deliberately free of server-only imports — the admin form is a
 * client component and needs the field list and the defaults too.
 */

export interface StoreSettings {
  name: string;
  /** Display form, e.g. "+38 (067) 341-37-51". The tel: link is derived. */
  phone: string;
  email: string;
  /** One or more lines separated by ";" — see `hourSegments`. */
  hours: string;
  address: string;
}

/** Shown until an admin saves something, and whenever the database is absent. */
export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  name: "ПанГосподар",
  phone: "+38 (067) 341-37-51",
  email: "O_delfin@ukr.net",
  hours: "Пн-Пт: 08:30 – 18:00; Сб: 09:00 – 15:00; Нд: вихідний",
  address: "вул. Центральна, 74, смт Ратне, Волинська область, 44100",
};

export interface StoreSettingsField {
  key: keyof StoreSettings;
  label: string;
  hint: string;
  maxLength: number;
  /** Render across both columns of the admin form. */
  wide?: boolean;
}

/** Single source of truth for the admin form and for server-side validation. */
export const STORE_SETTINGS_FIELDS: StoreSettingsField[] = [
  {
    key: "name",
    label: "Назва магазину",
    hint: "Підвал сайту та назва вкладки браузера.",
    maxLength: 80,
  },
  {
    key: "phone",
    label: "Телефон",
    hint: "Шапка, підвал і «Контакти». Посилання для дзвінка будується автоматично.",
    maxLength: 40,
  },
  {
    key: "email",
    label: "Email",
    hint: "Підвал і «Контакти». Не впливає на адресу, куди приходять замовлення.",
    maxLength: 120,
  },
  {
    key: "hours",
    label: "Графік роботи",
    hint: "Кілька рядків розділяйте крапкою з комою «;». У шапці показується лише перший.",
    maxLength: 300,
    wide: true,
  },
  {
    key: "address",
    label: "Адреса",
    hint: "Підвал і «Контакти».",
    maxLength: 200,
    wide: true,
  },
];

/**
 * Split the free-text schedule into displayable lines.
 * "Пн-Пт: 08:30 – 18:00; Сб: 09:00 – 15:00" → two entries.
 */
export function hourSegments(hours: string): string[] {
  return hours
    .split(/[;\n]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/** `tel:` target built from whatever digits the admin typed. */
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits ? `tel:+${digits}` : "";
}

export function mailHref(email: string): string {
  return email.trim() ? `mailto:${email.trim()}` : "";
}

/**
 * Coerce arbitrary stored/submitted values into a complete settings object.
 * Missing or blank fields fall back to the default, so the site never renders
 * an empty phone number because a row was half-written.
 */
export function normalizeStoreSettings(
  raw: Partial<Record<keyof StoreSettings, unknown>>,
): StoreSettings {
  const result = { ...DEFAULT_STORE_SETTINGS };
  for (const field of STORE_SETTINGS_FIELDS) {
    const value = String(raw[field.key] ?? "").trim().slice(0, field.maxLength);
    if (value) {
      result[field.key] = value;
    }
  }
  return result;
}
