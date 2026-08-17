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
import { after } from "next/server";
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
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
} from "@/lib/notifications";
import {
  RESET_TOKEN_TTL_MINUTES,
  buildResetLink,
  createResetToken,
  hasTrustedOrigin,
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

const NOT_CONFIGURED =
  "Відновлення пароля поштою поки не налаштоване. Зателефонуйте нам — " +
  "ми відновимо доступ вручну.";

/**
 * Can a reset link actually be built and delivered?
 *
 * Two halves, both required: credentials for a *verified sending domain*
 * (Resend refuses to mail a stranger from the shared sandbox sender) and an
 * origin the link may point at (`lib/password-reset.ts`). Checked before any
 * account lookup, so a misconfigured shop answers identically to everyone.
 *
 * In development the check is skipped and the link is printed to the terminal
 * instead — see `deliverResetLink`. Without that, the whole flow is untestable
 * locally unless you own a verified domain.
 */
function canDeliverResetLink(): boolean {
  return (
    (isPasswordResetEmailConfigured() && hasTrustedOrigin()) || isDevelopment()
  );
}

function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Hand the link to the customer — by mail, or to the developer's terminal when
 * mail is not configured and this is not production.
 *
 * Never throws and never reports back: the caller has already answered the
 * browser, and the answer must not depend on whether the address exists.
 */
async function deliverResetLink(email: string, link: string): Promise<void> {
  if (isPasswordResetEmailConfigured()) {
    await sendPasswordResetEmail(email, link, RESET_TOKEN_TTL_MINUTES);
    return;
  }
  if (isDevelopment()) {
    console.info(
      `[password-reset] DEV — mail is not configured, use this link:\n  ${link}`,
    );
  }
}

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
  if (!canDeliverResetLink()) {
    console.error(
      "[password-reset] Cannot send links: need RESEND_API_KEY, ORDER_EMAIL_FROM " +
        "on a domain verified in Resend, and SITE_URL. Run: npm run check:email",
    );
    return { error: NOT_CONFIGURED };
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
      // The link is built here, while the request is still in scope, and only
      // *sent* afterwards: a round trip to Resend takes a few hundred
      // milliseconds, and a reply that is measurably slower for a registered
      // address is an account-enumeration oracle no matter how carefully the
      // wording matches. A delivery failure is logged, never surfaced, for the
      // same reason.
      const link = await buildResetLink(token);
      const address = customer.email;
      after(async () => {
        await deliverResetLink(address, link);
      });
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
 *
 * Exported from a `"use server"` module, which makes it a public endpoint — so
 * it is throttled like everything else here. Only a *miss* is counted: a
 * genuine customer arriving with a live link (possibly several times, or with a
 * prefetch) never spends any of the budget, while anyone probing tokens burns
 * it at one row per guess.
 */
export async function isResetTokenValid(token: string): Promise<boolean> {
  if (!token || !hasDatabase()) {
    return false;
  }

  const ipHash = await hashClientIp("panhospodar-password-reset");
  if (await checkLoginRateLimit("reset", ipHash)) {
    return false;
  }

  try {
    await ensureCustomersSchema();
    const found = (await findPasswordReset(hashResetToken(token))) !== null;
    if (!found) {
      await recordFailedLoginAttempt("reset", ipHash);
    }
    return found;
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

  // A 256-bit token is not going to be guessed, but this is the one endpoint
  // that would happily accept an unlimited stream of attempts, and the cost of
  // not letting it is a single count query.
  const ipHash = await hashClientIp("panhospodar-password-reset");
  const limited = await checkLoginRateLimit("reset", ipHash);
  if (limited) {
    return { error: limited };
  }

  let consumed: Awaited<ReturnType<typeof consumePasswordReset>>;
  try {
    await ensureCustomersSchema();
    consumed = await consumePasswordReset(
      hashResetToken(token),
      await hashPassword(password),
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[password-reset] Reset failed: ${message}`);
    return { error: "Не вдалося змінити пароль. Спробуйте ще раз." };
  }

  if (consumed === null) {
    await recordFailedLoginAttempt("reset", ipHash);
    return {
      error:
        "Посилання застаріло або вже було використане. Запросіть відновлення ще раз.",
    };
  }

  // Tell the owner their password just changed. If it was not them — a stolen
  // mailbox, say — this is the message that surfaces it while the order history
  // can still be checked. Sent after the response for the same reason as above.
  const address = consumed.email;
  after(async () => {
    await sendPasswordChangedEmail(address);
  });

  // Signed in straight away: they have just proved control of the mailbox and
  // chosen a password, so a login form here would be pure friction. The new
  // session carries the raised generation, so this browser stays signed in
  // while every session issued before the reset is now dead.
  await createCustomerSession(consumed.id, consumed.sessionEpoch);
  // redirect() throws internally — keep it outside the try/catch.
  redirect("/account");
}
