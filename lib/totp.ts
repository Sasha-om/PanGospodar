/**
 * Time-based one-time passwords (RFC 6238) for the admin login.
 *
 * Written against `node:crypto` rather than pulling in a library: the whole
 * algorithm is an HMAC and a truncation, and an auth dependency is a
 * supply-chain risk out of all proportion to the twenty lines it saves.
 *
 * OPTIONAL, and off unless `ADMIN_TOTP_SECRET` is set — see README.md. The
 * admin credentials live in environment variables, which means there is no
 * password-rotation flow and no session list to revoke from; a second factor is
 * what keeps a leaked `ADMIN_PASSWORD` from being enough on its own.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Standard authenticator parameters — Google Authenticator, Aegis, 1Password. */
const DIGITS = 6;
const PERIOD_SECONDS = 30;

/**
 * How many steps either side of "now" are accepted. One step (±30 s) covers
 * the usual case of a clock that drifted or a code typed as it rolls over,
 * without widening the guessing window more than it has to.
 */
const DRIFT_STEPS = 1;

/** Is the second factor configured at all? */
export function isAdminTotpEnabled(): boolean {
  return normalizeSecret(process.env.ADMIN_TOTP_SECRET ?? "").length > 0;
}

/**
 * A configured secret that cannot possibly work, described in a sentence — or
 * `null` when there is nothing wrong.
 *
 * This exists because the failure is otherwise indistinguishable from a wrong
 * code: a secret with a typo (base32 has no `0`, `1`, `8` or `9`) decodes to
 * nothing, every code is rejected, and the only symptom is an admin locked out
 * of their own panel, retyping a code that was correct all along. The login
 * surfaces this the same way it already surfaces a missing `ADMIN_PASSWORD`.
 *
 * Reporting it is safe: it says the secret is malformed, never what it is, and
 * only an operator who can read the deploy's environment can act on it.
 */
export function adminTotpSecretIssue(): string | null {
  const raw = process.env.ADMIN_TOTP_SECRET ?? "";
  if (normalizeSecret(raw).length === 0) {
    return null; // Not configured — 2FA is simply off.
  }
  if (base32Decode(raw).length === 0) {
    return (
      "ADMIN_TOTP_SECRET не є коректним base32 — у ньому є символи поза " +
      "алфавітом A–Z та 2–7 (найчастіше 0, 1, 8 або 9). Згенеруйте секрет " +
      "командою: openssl rand -base64 20 | base32 | tr -d '='"
    );
  }
  return null;
}

/** Authenticator apps print the secret in groups and lower case; accept both. */
function normalizeSecret(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Decode an RFC 4648 base32 secret (the format every authenticator app shows).
 * Returns an empty buffer for anything malformed, which reads downstream as
 * "no valid secret" — never as "accept any code".
 */
function base32Decode(input: string): Buffer {
  const clean = normalizeSecret(input).replace(/=+$/, "");
  if (!clean) {
    return Buffer.alloc(0);
  }

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      return Buffer.alloc(0);
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** The 6-digit code for one 30-second step, per RFC 6238's truncation. */
function codeForStep(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  // Big-endian 64-bit counter. Written as two 32-bit halves because the step
  // number is small enough that the high half is always zero, and this avoids
  // BigInt for no gain.
  counter.writeUInt32BE(Math.floor(step / 2 ** 32), 0);
  counter.writeUInt32BE(step >>> 0, 4);

  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Constant-time compare, so a wrong code never leaks how wrong it was. */
function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Does `code` match the configured secret right now?
 *
 * Returns `false` for a missing/malformed secret and for anything that is not
 * exactly six digits — this is the gate on the admin panel, so every unclear
 * case has to fail closed. Callers must check `isAdminTotpEnabled()` first;
 * this function never means "2FA is off".
 */
export function verifyAdminTotp(code: string): boolean {
  const secret = base32Decode(process.env.ADMIN_TOTP_SECRET ?? "");
  if (secret.length === 0) {
    return false;
  }

  const entered = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(entered)) {
    return false;
  }

  const currentStep = Math.floor(Date.now() / 1000 / PERIOD_SECONDS);
  // Every candidate is evaluated — no early return — so a valid code costs the
  // same time as an invalid one.
  let matched = false;
  for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift += 1) {
    matched = equals(codeForStep(secret, currentStep + drift), entered) || matched;
  }
  return matched;
}
