/**
 * Shared brute-force throttle for both logins (admin and customer).
 *
 * Timing-safe credential comparison stops an attacker from *guessing* a
 * password one character at a time, but says nothing about how many times they
 * may guess — this caps that instead, along two independent axes:
 *
 *   - per IP     — 8 failures / 15 min. Stops the simple case: one script,
 *                  one address, a wordlist.
 *   - per account — 20 failures / 60 min, from any address. Stops the case the
 *                  per-IP budget is blind to: credential stuffing spread over
 *                  a botnet, where each request comes from a fresh address but
 *                  always targets the same email.
 *
 * Neither axis shares a budget between the admin and customer logins (see
 * `LoginScope`). Both allowances are generous for someone who mistyped a
 * password, and far too slow to brute-force a password of any real length.
 *
 * What this still does not stop: a *broad* stuffing run that tries one leaked
 * password against thousands of different accounts, which stays under both
 * budgets. The answer to that is a captcha, and it needs an external service —
 * see the note in README.md.
 */

import { hashIdentifier } from "@/lib/client-ip";
import {
  countRecentAccountLoginAttempts,
  countRecentLoginAttempts,
  ensureLoginAttemptsSchema,
  hasDatabase,
  recordFailedLogin,
  type LoginScope,
} from "@/lib/db";

export const LOGIN_RATE_LIMIT = { maxAttempts: 8, windowMinutes: 15 } as const;
export const ACCOUNT_RATE_LIMIT = { maxAttempts: 20, windowMinutes: 60 } as const;

export const TOO_MANY_LOGIN_ATTEMPTS =
  "Забагато невдалих спроб входу. Спробуйте ще раз за 15 хвилин.";

export const TOO_MANY_ACCOUNT_ATTEMPTS =
  "Забагато невдалих спроб входу в цей акаунт. Спробуйте ще раз за годину або відновіть пароль.";

/** Salted hash of the email a login was attempted against. `""` when absent. */
export function hashAccount(email: string): string {
  return hashIdentifier("login-account", email);
}

/**
 * Is this login attempt currently locked out — by address, by account, or
 * both? Returns the message to show, or `null` when the attempt may proceed.
 *
 * Fails open — on a missing database, an empty key (nothing to key on) or any
 * bookkeeping error — because rate-limit plumbing must never be the reason a
 * legitimate user cannot sign in. The credential check that follows still
 * stands on its own either way.
 */
export async function checkLoginRateLimit(
  scope: LoginScope,
  ipHash: string,
  accountHash = "",
): Promise<string | null> {
  if (!hasDatabase() || (!ipHash && !accountHash)) {
    return null;
  }
  try {
    await ensureLoginAttemptsSchema();

    const [byIp, byAccount] = await Promise.all([
      ipHash
        ? countRecentLoginAttempts(scope, ipHash, LOGIN_RATE_LIMIT.windowMinutes)
        : Promise.resolve(0),
      accountHash
        ? countRecentAccountLoginAttempts(
            scope,
            accountHash,
            ACCOUNT_RATE_LIMIT.windowMinutes,
          )
        : Promise.resolve(0),
    ]);

    if (byIp >= LOGIN_RATE_LIMIT.maxAttempts) {
      return TOO_MANY_LOGIN_ATTEMPTS;
    }
    if (byAccount >= ACCOUNT_RATE_LIMIT.maxAttempts) {
      return TOO_MANY_ACCOUNT_ATTEMPTS;
    }
    return null;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[login-rate-limit] Check failed for "${scope}": ${message}`);
    return null;
  }
}

/** Record a failed attempt. Best-effort — a logging failure must not surface. */
export async function recordFailedLoginAttempt(
  scope: LoginScope,
  ipHash: string,
  accountHash = "",
): Promise<void> {
  if (!hasDatabase() || (!ipHash && !accountHash)) {
    return;
  }
  try {
    await recordFailedLogin(scope, ipHash, accountHash);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[login-rate-limit] Failed to record attempt for "${scope}": ${message}`);
  }
}
