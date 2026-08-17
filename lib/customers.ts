/**
 * Customer account domain: types, validation and password hashing.
 *
 * Hashing uses Node's built-in `scrypt` — memory-hard, in the standard library,
 * and available on Vercel's Node runtime, so accounts need no extra dependency
 * and no external auth service.
 */

import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

/**
 * `promisify` resolves to scrypt's 3-argument overload, which drops the cost
 * parameters — assert the 4-argument form so N/r/p are actually applied.
 */
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/** OWASP-recommended scrypt parameters; ~100 ms per hash on Vercel. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

export const EMAIL_MAX = 200;
export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export interface Customer {
  id: number;
  email: string;
  name: string;
  phone: string;
  createdAt: string;
  /**
   * Session generation — see `session_epoch` in `lib/db.ts`. Every session
   * cookie is signed with the value that was current when it was issued, so
   * raising it (password reset, password change) logs the account out
   * everywhere at once.
   */
  sessionEpoch: number;
}

export interface CustomerWithSecret extends Customer {
  passwordHash: string;
}

/**
 * Encode a password as `scrypt$N$r$p$salt$hash`.
 *
 * The parameters travel with the hash so they can be raised later without
 * invalidating existing accounts.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  }));
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

/**
 * Check a password against a stored hash.
 *
 * Never throws on a malformed hash — a corrupt row must read as "wrong
 * password", not as a server error that reveals the account exists.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") {
      return false;
    }
    const [, n, r, p, saltHex, hashHex] = parts;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");

    // A zero-length salt or key would make scrypt return an empty buffer, and
    // `timingSafeEqual(empty, empty)` is true — so a truncated row like
    // `scrypt$16384$8$1$$` would accept ANY password. Reject those outright,
    // along with non-positive cost parameters.
    if (salt.length === 0 || expected.length === 0) {
      return false;
    }
    for (const value of [Number(n), Number(r), Number(p)]) {
      if (!Number.isInteger(value) || value <= 0) {
        return false;
      }
    }
    const derived = (await scryptAsync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    }));
    // Constant-time: a length-aware compare would leak via early exit.
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Lowercased and trimmed — the column is unique on this normalized form. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return value.length <= EMAIL_MAX && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Field-level validation shared by the register action and the account form. */
export function validateRegistration(input: {
  email: string;
  name: string;
  password: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!isValidEmail(input.email)) {
    errors.email = "Вкажіть коректну email-адресу.";
  }
  if (input.name.length < NAME_MIN) {
    errors.name = "Вкажіть ім'я (щонайменше 2 символи).";
  } else if (input.name.length > NAME_MAX) {
    errors.name = `Ім'я задовге (максимум ${NAME_MAX} символів).`;
  }
  if (input.password.length < PASSWORD_MIN) {
    errors.password = `Пароль закороткий (щонайменше ${PASSWORD_MIN} символів).`;
  } else if (input.password.length > PASSWORD_MAX) {
    errors.password = "Пароль задовгий.";
  }

  return errors;
}
