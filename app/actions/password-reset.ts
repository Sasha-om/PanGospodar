"use server";

/**
 * "Забули пароль?" — request a reset link, then use it.
 *
 * Two rules shape everything here:
 *
 *  1. **Never reveal whether an address is registered.** The request form
 *     answers identically for a known and an unknown email, so it cannot be
 *     used to harvest the customer list.
 *  2. **A ticket is single-use and short-lived.** Enforced in the database
 *     (`consumePasswordReset`), not here, so two simultaneous submissions
 *     cannot both succeed.
 */

import { redirect } from "next/navigation";
import { hashClientIp } from "@/lib/client-ip";
import { createCustomerSession } from "@/lib/customer-session";
import {
  consumePasswordReset,
  createPasswordReset,
  ensureCustomersSchema,
  findCustomerByEmail,
  findPasswordReset,
  hasDatabase,
} from "@/lib/db";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  hashPassword,
  isValidEmail,
  normalizeEmail,
} from "@/lib/customers";
import {
  checkLoginRateLimit,
  guardWithCaptcha,
  hashAccount,
  needsCaptcha,
  recordFailedLoginAttempt,
} from "@/lib/login-rate-limit";
import { TURNSTILE_FIELD } from "@/lib/turnstile";
import {
  isPasswordResetEmailConfigured,
  sendPasswordResetEmail,
} from "@/lib/notifications";
import {
  RESET_TOKEN_TTL_MINUTES,
  buildResetLink,
  createResetToken,
  hashResetToken,
  resetTokenExpiry,
} from "@/lib/password-reset";

export interface ResetRequestState {
  error?: string;
  /** Set once the request was accepted — the form swaps to a confirmation. */
  sent?: boolean;
  /** Tells the form to show the challenge on the next attempt. */
  requireCaptcha?: boolean;
}

export interface ResetPasswordState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const DB_DOWN =
  "Сервер тимчасово недоступний. Спробуйте пізніше або зателефонуйте нам.";

export async function requestPasswordReset(
  _prevState: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = normalizeEmail(String(formData.get("email") ?? "").trim());

  if (!isValidEmail(email)) {
    return { error: "Вкажіть коректну email-адресу." };
  }
  if (!hasDatabase()) {
    console.error("[password-reset] No database configured");
    return { error: DB_DOWN };
  }
  // Checked before the lookup so the answer cannot depend on the account.
  if (!isPasswordResetEmailConfigured()) {
    return {
      error:
        "Відновлення пароля поштою поки не налаштоване. Зателефонуйте нам — " +
        "ми відновимо доступ вручну.",
    };
  }

  // Throttled on both axes, like a login: per address so one script cannot
  // hammer the form, and per account so nobody can flood a customer's inbox
  // by asking for a link over and over.
  const ipHash = await hashClientIp("panhospodar-password-reset");
  const accountHash = hashAccount(email);
  const limited = await checkLoginRateLimit("reset", ipHash, accountHash);
  if (limited) {
    return { error: limited };
  }

  // Sending mail on someone else's behalf is worth a challenge sooner than a
  // login is. Inert unless Turnstile is configured.
  const challenge = await guardWithCaptcha(
    "reset",
    ipHash,
    accountHash,
    String(formData.get(TURNSTILE_FIELD) ?? ""),
  );
  if (challenge) {
    return { error: challenge, requireCaptcha: true };
  }

  // Every request counts, not just failed ones: the budget here is about how
  // much mail may be triggered, not about how many guesses were wrong.
  await recordFailedLoginAttempt("reset", ipHash, accountHash);

  try {
    await ensureCustomersSchema();
    const customer = await findCustomerByEmail(email);

    if (customer) {
      const { token, tokenHash } = createResetToken();
      await createPasswordReset(customer.id, tokenHash, resetTokenExpiry());
      // A delivery failure is logged, never surfaced: the reply must not
      // differ from the one an unknown address gets.
      await sendPasswordResetEmail(
        customer.email,
        await buildResetLink(token),
        RESET_TOKEN_TTL_MINUTES,
      );
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[password-reset] Request failed: ${message}`);
    return {
      error: "Не вдалося обробити запит. Спробуйте ще раз.",
      requireCaptcha: await needsCaptcha("reset", ipHash, accountHash),
    };
  }

  return { sent: true, error: undefined };
}

/**
 * Is this token still good? Used by the reset page to show "посилання
 * застаріло" before the customer types a new password twice for nothing.
 */
export async function isResetTokenValid(token: string): Promise<boolean> {
  if (!token || !hasDatabase()) {
    return false;
  }
  try {
    await ensureCustomersSchema();
    return (await findPasswordReset(hashResetToken(token))) !== null;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[password-reset] Token check failed: ${message}`);
    return false;
  }
}

export async function resetPassword(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (password.length < PASSWORD_MIN) {
    fieldErrors.password = `Пароль закороткий (щонайменше ${PASSWORD_MIN} символів).`;
  } else if (password.length > PASSWORD_MAX) {
    fieldErrors.password = "Пароль задовгий.";
  } else if (password !== confirm) {
    fieldErrors.confirm = "Паролі не збігаються.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Перевірте заповнені поля.", fieldErrors };
  }

  if (!token) {
    return { error: "Посилання недійсне. Запросіть відновлення ще раз." };
  }
  if (!hasDatabase()) {
    return { error: DB_DOWN };
  }

  let customerId: number | null;
  try {
    await ensureCustomersSchema();
    customerId = await consumePasswordReset(
      hashResetToken(token),
      await hashPassword(password),
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[password-reset] Reset failed: ${message}`);
    return { error: "Не вдалося змінити пароль. Спробуйте ще раз." };
  }

  if (customerId === null) {
    return {
      error:
        "Посилання застаріло або вже було використане. Запросіть відновлення ще раз.",
    };
  }

  // Signed in straight away: they have just proved control of the mailbox and
  // chosen a password, so a login form here would be pure friction.
  await createCustomerSession(customerId);
  // redirect() throws internally — keep it outside the try/catch.
  redirect("/account");
}
