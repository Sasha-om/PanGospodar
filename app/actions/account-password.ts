"use server";

/**
 * Changing the password from inside the account.
 *
 * The flow that was missing: until now the *only* way to change a password was
 * the "forgot password" email, which makes every routine password change
 * depend on a third-party mail service being configured and on the customer's
 * mailbox being reachable. This path needs neither — it proves identity with
 * the current password instead of with a mailbox.
 *
 * Three rules:
 *  1. **The current password is required.** A session alone is not enough: a
 *     borrowed laptop or a stolen cookie must not be able to lock the owner out
 *     of their own account.
 *  2. **Every other session dies.** `changeCustomerPassword` raises the
 *     account's session generation; this browser gets a fresh cookie, all
 *     others stop counting (see `lib/customer-session.ts`).
 *  3. **The owner is told.** A change nobody announced is how a takeover stays
 *     quiet — the notification is sent even though the customer just did it
 *     themselves, because the person who did it is exactly who needs to know
 *     when it was someone else.
 */

import { after } from "next/server";
import { hashClientIp } from "@/lib/client-ip";
import { createCustomerSession, getCustomerId } from "@/lib/customer-session";
import {
  changeCustomerPassword,
  ensureCustomersSchema,
  findCustomerSecretById,
  hasDatabase,
} from "@/lib/db";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  hashPassword,
  verifyPassword,
} from "@/lib/customers";
import {
  checkLoginRateLimit,
  hashAccount,
  recordFailedLoginAttempt,
} from "@/lib/login-rate-limit";
import { sendPasswordChangedEmail } from "@/lib/notifications";

export interface ChangePasswordState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set once the password was actually replaced — the form says so. */
  changed?: boolean;
}

export async function changePassword(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const customerId = await getCustomerId();
  if (!customerId) {
    return { error: "Сеанс завершено. Увійдіть ще раз." };
  }
  if (!hasDatabase()) {
    return {
      error: "Сервер тимчасово недоступний. Спробуйте пізніше.",
    };
  }

  const fieldErrors: Record<string, string> = {};
  if (!current) {
    fieldErrors.current = "Введіть поточний пароль.";
  }
  if (password.length < PASSWORD_MIN) {
    fieldErrors.password = `Пароль закороткий (щонайменше ${PASSWORD_MIN} символів).`;
  } else if (password.length > PASSWORD_MAX) {
    fieldErrors.password = "Пароль задовгий.";
  } else if (password === current) {
    fieldErrors.password = "Новий пароль збігається з поточним.";
  } else if (password !== confirm) {
    fieldErrors.confirm = "Паролі не збігаються.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Перевірте заповнені поля.", fieldErrors };
  }

  let email: string;
  let newEpoch: number | null;
  try {
    await ensureCustomersSchema();
    const customer = await findCustomerSecretById(customerId);
    if (!customer) {
      return { error: "Сеанс завершено. Увійдіть ще раз." };
    }
    email = customer.email;

    // Guessing the current password through this form is a login attempt in
    // everything but name, so it is counted as one — same table, same budget.
    const ipHash = await hashClientIp("panhospodar-customer-login");
    const accountHash = hashAccount(customer.email);
    const limited = await checkLoginRateLimit("customer", ipHash, accountHash);
    if (limited) {
      return { error: limited };
    }

    if (!(await verifyPassword(current, customer.passwordHash))) {
      await recordFailedLoginAttempt("customer", ipHash, accountHash);
      return {
        error: "Поточний пароль введено невірно.",
        fieldErrors: { current: "Невірний пароль." },
      };
    }

    newEpoch = await changeCustomerPassword(
      customerId,
      await hashPassword(password),
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[account] Password change failed: ${message}`);
    return { error: "Не вдалося змінити пароль. Спробуйте ще раз." };
  }

  if (newEpoch === null) {
    return { error: "Сеанс завершено. Увійдіть ще раз." };
  }

  // A fresh cookie at the new generation: this browser stays signed in, every
  // other one is now holding a token the server no longer accepts.
  await createCustomerSession(customerId, newEpoch);

  after(async () => {
    await sendPasswordChangedEmail(email);
  });

  return { changed: true };
}
