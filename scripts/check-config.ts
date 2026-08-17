/**
 * Read every environment variable the site depends on and report what is
 * missing, malformed, or named in a way that will silently not work.
 *
 *   npm run check:config
 *
 * The point is the *silent* failures. A missing `RESEND_API_KEY` announces
 * itself the first time an order comes in; `TURNSTILE_SITE_KEY` named without
 * the `NEXT_PUBLIC_` prefix does not — the build simply drops it, the widget
 * never renders, and nothing anywhere says why.
 *
 * Values are never printed: only whether they are set, and whether their shape
 * is right.
 *
 * Checks whatever is in `.env.local`. For the deployed values:
 *   npx vercel env pull .env.local
 */

import { config } from "dotenv";
import { CONNECTION_ENV_VARS } from "../lib/db";

config({ path: ".env.local", quiet: true });

type Level = "ok" | "warn" | "fail" | "off";

const MARK: Record<Level, string> = {
  ok: "  ok  ",
  warn: " warn ",
  fail: " FAIL ",
  off: "  --  ",
};

let failures = 0;
let warnings = 0;

function report(level: Level, name: string, detail: string): void {
  if (level === "fail") failures += 1;
  if (level === "warn") warnings += 1;
  console.log(`${MARK[level]} ${name.padEnd(32)} ${detail}`);
}

const value = (name: string): string => process.env[name]?.trim() ?? "";
const isSet = (name: string): boolean => value(name).length > 0;

function section(title: string): void {
  console.log(`\n${title}\n${"-".repeat(title.length)}`);
}

/* ------------------------------- required -------------------------------- */

section("Обов'язкове");

const dbVar = CONNECTION_ENV_VARS.find((name) => isSet(name));
report(
  dbVar ? "ok" : "fail",
  "База даних",
  dbVar ? `рядок підключення у ${dbVar}` : `не задано жодної з: ${CONNECTION_ENV_VARS.slice(0, 3).join(", ")}…`,
);

const secret = value("SESSION_SECRET");
report(
  secret.length >= 32 ? "ok" : secret ? "warn" : "fail",
  "SESSION_SECRET",
  secret.length >= 32
    ? `${secret.length} символів`
    : secret
      ? `лише ${secret.length} символів — згенеруйте довший: openssl rand -base64 32`
      : "не задано — вхід не працюватиме взагалі",
);

report(
  isSet("ADMIN_PASSWORD") ? "ok" : "fail",
  "ADMIN_PASSWORD",
  isSet("ADMIN_PASSWORD") ? "задано" : "не задано — вхід в /admin неможливий",
);
report("ok", "ADMIN_USERNAME", value("ADMIN_USERNAME") || "не задано → \"admin\"");

/* ------------------------------ two-factor ------------------------------- */

section("Двофакторна автентифікація адміна");

if (!isSet("ADMIN_TOTP_SECRET")) {
  report("off", "ADMIN_TOTP_SECRET", "не задано — 2FA вимкнена (це нормально)");
} else {
  const clean = value("ADMIN_TOTP_SECRET").replace(/[\s-]/g, "").toUpperCase();
  const validBase32 = /^[A-Z2-7]+=*$/.test(clean);
  report(
    validBase32 ? "ok" : "fail",
    "ADMIN_TOTP_SECRET",
    validBase32
      ? "коректний base32 — перевірте кодом: npm run check:totp"
      : "НЕ base32 (є символи поза A–Z та 2–7) — вхід в /admin заблоковано",
  );
}

/* --------------------------------- email --------------------------------- */

section("Пошта (Resend)");

const from = value("ORDER_EMAIL_FROM");
// Resend accepts both "name@example.com" and "Ім'я <name@example.com>".
const fromAddress = from.match(/<([^>]+)>/)?.[1] ?? from;
const fromLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress);

report(
  isSet("RESEND_API_KEY") ? "ok" : "warn",
  "RESEND_API_KEY",
  isSet("RESEND_API_KEY")
    ? "задано — чи працює насправді: npm run check:email"
    : "не задано — листи не надсилатимуться",
);
// The classic silent failure: the sandbox sender is accepted by Resend and by
// every check here, but delivers only to the account owner — so order mail
// arrives, password resets to customers never do.
if (/resend\.dev/i.test(value("ORDER_EMAIL_FROM"))) {
  report(
    "fail",
    "відправник resend.dev",
    "onboarding@resend.dev доставляє ЛИШЕ власнику акаунта Resend — " +
      "клієнти не отримають відновлення пароля. Потрібен свій домен.",
  );
}
report(
  from ? (fromLooksValid ? "ok" : "fail") : "warn",
  "ORDER_EMAIL_FROM",
  from
    ? fromLooksValid
      ? `відправник на домені ${fromAddress.split("@")[1]}`
      : `«${from}» — це не адреса. Потрібно name@домен або Ім'я <name@домен>`
    : "не задано — відновлення пароля поштою не працюватиме",
);
report(
  isSet("ADMIN_EMAIL") ? "ok" : "warn",
  "ADMIN_EMAIL",
  isSet("ADMIN_EMAIL") ? "задано" : "не задано — замовлення прийдуть лише в Telegram",
);

/* ------------------------------- site URL -------------------------------- */

section("Адреса сайту (посилання у листах)");

const siteUrl = value("SITE_URL") || value("NEXT_PUBLIC_SITE_URL");
if (!siteUrl) {
  report(
    value("VERCEL_PROJECT_PRODUCTION_URL") ? "warn" : "fail",
    "SITE_URL",
    value("VERCEL_PROJECT_PRODUCTION_URL")
      ? "не задано — буде взято адресу проєкту Vercel"
      : "не задано — посилання будуються із заголовка Host запиту",
  );
} else {
  let host = "";
  let secure = false;
  try {
    const parsed = new URL(siteUrl);
    host = parsed.host;
    secure = parsed.protocol === "https:";
  } catch {
    host = "";
  }
  report(
    host && secure ? "ok" : "fail",
    "SITE_URL",
    !host
      ? `«${siteUrl}» — не URL. Потрібно https://домен`
      : secure
        ? `посилання вестимуть на ${host}`
        : `${host} без https — браузер відхилить посилання з листа`,
  );

  // A reset link from one domain signed by mail from another lands in spam far
  // more often, so a mismatch is worth naming even though it is legal.
  if (host && fromLooksValid) {
    const mailDomain = fromAddress.split("@")[1] ?? "";
    const siteDomain = host.replace(/^www\./, "");
    const sameDomain =
      mailDomain === siteDomain ||
      mailDomain.endsWith(`.${siteDomain}`) ||
      siteDomain.endsWith(`.${mailDomain}`);
    report(
      sameDomain ? "ok" : "warn",
      "домен пошти vs домен сайту",
      sameDomain
        ? `збігаються (${siteDomain})`
        : `лист із ${mailDomain}, а посилання на ${siteDomain} — вища ймовірність спам-теки`,
    );
  }
}

/* -------------------------------- captcha -------------------------------- */

section("Капча (Cloudflare Turnstile)");

const siteKey = value("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
const captchaSecret = value("TURNSTILE_SECRET_KEY");
// The classic mistake: without the NEXT_PUBLIC_ prefix the value never reaches
// the browser bundle, so the widget silently never appears.
const misnamed = ["TURNSTILE_SITE_KEY", "CLOUDFLARE_TURNSTILE_SITE_KEY"].filter(
  (name) => isSet(name),
);

if (!siteKey && !captchaSecret) {
  report("off", "Turnstile", "ключів немає — капча вимкнена (це нормально)");
} else if (siteKey && captchaSecret) {
  report("ok", "Turnstile", "обидва ключі задано — капча активна");
} else {
  report(
    "fail",
    "Turnstile",
    siteKey
      ? "є лише NEXT_PUBLIC_TURNSTILE_SITE_KEY — без TURNSTILE_SECRET_KEY відповідь ніхто не перевіряє"
      : "є лише TURNSTILE_SECRET_KEY — без NEXT_PUBLIC_TURNSTILE_SITE_KEY віджет не з'явиться",
  );
}
if (misnamed.length > 0 && !siteKey) {
  report(
    "fail",
    "назва змінної",
    `${misnamed.join(", ")} → перейменуйте на NEXT_PUBLIC_TURNSTILE_SITE_KEY (без префікса значення не потрапляє у браузер) і зробіть Redeploy`,
  );
}
if (siteKey && !/^0x|^1x|^2x|^3x/.test(siteKey)) {
  report("warn", "формат site key", "не схожий на ключ Turnstile (зазвичай починається з 0x)");
}

/* --------------------------------- other --------------------------------- */

section("Решта");

for (const [name, note] of [
  ["IMPORT_TOKEN", "синхронізація залишків із УкрСклад"],
  ["TELEGRAM_BOT_TOKEN", "сповіщення про замовлення"],
  ["TELEGRAM_CHAT_ID", "сповіщення про замовлення"],
  ["NOVA_POSHTA_API_KEY", "вибір міста та відділення"],
  ["BLOB_READ_WRITE_TOKEN", "завантаження фото товарів"],
] as const) {
  report(isSet(name) ? "ok" : "warn", name, isSet(name) ? "задано" : `не задано — ${note}`);
}

/* -------------------------------- verdict -------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`Знайдено помилок: ${failures}, попереджень: ${warnings}.\n`);
  process.exit(1);
}
console.log(
  warnings > 0
    ? `Критичних помилок немає. Попереджень: ${warnings}.\n`
    : "Усе налаштовано.\n",
);
