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
 * A *broad* stuffing run — one leaked password against thousands of different
 * accounts — stays under both budgets by design, because no per-key counter can
 * see it. That is what `needsCaptcha` is for: once a caller has a few failures
 * behind it, it must also answer a challenge (`lib/turnstile.ts`), which costs
 * a human two seconds and a script the whole attack.
 */

import { hashIdentifier, readClientIp } from "@/lib/client-ip";
import {
  countRecentAccountLoginAttempts,
  countRecentLoginAttempts,
  ensureLoginAttemptsSchema,
  hasDatabase,
  recordFailedLogin,
  type LoginScope,
} from "@/lib/db";
import {
  CAPTCHA_FAILED,
  isTurnstileEnabled,
  verifyTurnstile,
} from "@/lib/turnstile";

export const LOGIN_RATE_LIMIT = { maxAttempts: 8, windowMinutes: 15 } as const;
export const ACCOUNT_RATE_LIMIT = { maxAttempts: 20, windowMinutes: 60 } as const;

export const TOO_MANY_LOGIN_ATTEMPTS =
  "Забагато невдалих спроб входу. Спробуйте ще раз за 15 хвилин.";

export const TOO_MANY_ACCOUNT_ATTEMPTS =
  "Забагато невдалих спроб входу в цей акаунт. Спробуйте ще раз за годину або відновіть пароль.";

/**
 * Failures before a challenge is demanded.
 *
 * Three is past "mistyped it" and well short of the hard 8-attempt lockout, so
 * the challenge is what a real person meets first — and the person can still
 * get in, which is the whole advantage over a flat block.
 */
export const CAPTCHA_AFTER_FAILURES = 3;

/** Salted hash of the email a login was attempted against. `""` when absent. */
export function hashAccount(email: string): string {
  return hashIdentifier("login-account", email);
}

/**
 * Has this caller failed often enough that it must answer a challenge?
 *
 * Counts the same rows the rate limiter does, at a lower threshold. Either key
 * can trigger it: a botnet has a fresh address every time but keeps hitting one
 * account, and a single script keeps one address across many accounts.
 *
 * Fails **open** — an unreachable database must not lock everyone behind a
 * challenge they cannot pass. The credential check still stands on its own,
 * and the hard rate limit above is unaffected.
 */
export async function needsCaptcha(
  scope: LoginScope,
  ipHash: string,
  accountHash = "",
): Promise<boolean> {
  if (!isTurnstileEnabled() || !hasDatabase() || (!ipHash && !accountHash)) {
    return false;
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
    return Math.max(byIp, byAccount) >= CAPTCHA_AFTER_FAILURES;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[login-rate-limit] Captcha check failed for "${scope}": ${message}`);
    return false;
  }
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

/**
 * The challenge gate, as the three call sites (both logins and the reset
 * request) all need it: decide whether one is due, and check the answer.
 *
 * Returns `null` to proceed, or the message to show. Kept here rather than in
 * `lib/turnstile.ts` because the *decision* is a rate-limit question; Turnstile
 * only knows how to validate an answer.
 */
export async function guardWithCaptcha(
  scope: LoginScope,
  ipHash: string,
  accountHash: string,
  answer: string,
): Promise<string | null> {
  if (!(await needsCaptcha(scope, ipHash, accountHash))) {
    return null;
  }
  const ok = await verifyTurnstile(answer, await readClientIp());
  return ok ? null : CAPTCHA_FAILED;
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
