"use server";

/**
 * Customer registration and sign-in.
 *
 * Separate from `auth.ts`, which authenticates the single admin against
 * environment variables. These accounts live in the database and get their own
 * session cookie, so a customer login can never satisfy the admin guard.
 */

import { redirect } from "next/navigation";
import {
  EmailTakenError,
  createCustomer,
  ensureCustomersSchema,
  findCustomerByEmail,
  hasDatabase,
  mergeFavorites,
} from "@/lib/db";
import { createCustomerSession, deleteCustomerSession } from "@/lib/customer-session";
import {
  hashPassword,
  isValidEmail,
  normalizeEmail,
  validateRegistration,
  verifyPassword,
} from "@/lib/customers";
import { normalizePhone } from "@/lib/orders";

export interface AuthState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const DB_DOWN =
  "Сервер тимчасово недоступний. Спробуйте пізніше або зателефонуйте нам.";

/** Only in-app account paths — never an arbitrary URL from the query string. */
function safeRedirect(from: FormDataEntryValue | null): string {
  const value = typeof from === "string" ? from : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

/** Guest favourites ride along with the form so they survive the sign-in. */
function parseFavorites(raw: FormDataEntryValue | null): string[] {
  try {
    const parsed: unknown = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(parsed)
      ? parsed
          .filter((sku): sku is string => typeof sku === "string")
          .slice(0, 200)
      : [];
  } catch {
    return [];
  }
}

export async function registerCustomer(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const text = (key: string) => String(formData.get(key) ?? "").trim();

  const email = normalizeEmail(text("email"));
  const name = text("name");
  const password = String(formData.get("password") ?? "");
  const phone = normalizePhone(text("phone")) ?? "";
  const redirectTo = safeRedirect(formData.get("from"));
  const guestFavorites = parseFavorites(formData.get("favorites"));

  const fieldErrors = validateRegistration({ email, name, password });
  if (text("phone") && !phone) {
    fieldErrors.phone = "Вкажіть номер у форматі +380 XX XXX XX XX.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Перевірте заповнені поля.", fieldErrors };
  }

  if (!hasDatabase()) {
    console.error("[account] No database configured — cannot register");
    return { error: DB_DOWN };
  }

  let customerId: number;
  try {
    await ensureCustomersSchema();
    const customer = await createCustomer({
      email,
      passwordHash: await hashPassword(password),
      name,
      phone,
    });
    customerId = customer.id;
    await mergeFavorites(customerId, guestFavorites);
  } catch (caught) {
    if (caught instanceof EmailTakenError) {
      return {
        error: "Обліковий запис з такою поштою вже існує.",
        fieldErrors: { email: "Ця адреса вже зареєстрована. Увійдіть замість реєстрації." },
      };
    }
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[account] Registration failed: ${message}`);
    return { error: "Не вдалося створити акаунт. Спробуйте ще раз." };
  }

  await createCustomerSession(customerId);
  // redirect() throws internally — keep it outside the try/catch.
  redirect(redirectTo);
}

export async function loginCustomer(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? "").trim());
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirect(formData.get("from"));
  const guestFavorites = parseFavorites(formData.get("favorites"));

  if (!isValidEmail(email) || !password) {
    return { error: "Вкажіть email і пароль." };
  }
  if (!hasDatabase()) {
    console.error("[account] No database configured — cannot sign in");
    return { error: DB_DOWN };
  }

  let customerId: number;
  try {
    await ensureCustomersSchema();
    const customer = await findCustomerByEmail(email);
    // Hash even when the account is missing, so response time does not reveal
    // which addresses are registered.
    const ok = customer
      ? await verifyPassword(password, customer.passwordHash)
      : await verifyPassword(password, "scrypt$16384$8$1$00$00");

    if (!customer || !ok) {
      return { error: "Невірний email або пароль." };
    }
    customerId = customer.id;
    await mergeFavorites(customerId, guestFavorites);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[account] Sign-in failed: ${message}`);
    return { error: "Не вдалося увійти. Спробуйте ще раз." };
  }

  await createCustomerSession(customerId);
  redirect(redirectTo);
}

export async function logoutCustomer(): Promise<void> {
  await deleteCustomerSession();
  redirect("/");
}
