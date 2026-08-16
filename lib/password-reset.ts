/**
 * Password-reset tickets (server-only).
 *
 * The token is a 32-byte random value that exists in exactly one place — the
 * email — and is stored only as a SHA-256 digest (see `password_resets` in
 * `lib/db.ts`). Same reasoning as password hashing: whoever reads the table
 * later still cannot open anybody's account.
 */

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";

/**
 * Long enough for someone to find the mail and act on it, short enough that a
 * message left sitting in an inbox is not a standing key to the account.
 */
export const RESET_TOKEN_TTL_MINUTES = 60;

/** A fresh token and the digest to store for it. */
export function createResetToken(): { token: string; tokenHash: string } {
  // 256 bits from the OS CSPRNG — not guessable, and base64url keeps it
  // copy-paste safe inside a query string.
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resetTokenExpiry(): Date {
  return new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
}

/**
 * Absolute base URL for links that leave the site (reset emails).
 *
 * Configuration first, request second, and deliberately so: a `Host` header is
 * attacker-controlled in the general case, and a reset link built from it would
 * point the customer's one-time token at whatever host the attacker asked for.
 * Vercel only accepts hosts that belong to the project, which makes the
 * fallback safe *there* — set `SITE_URL` anyway, and it stops mattering.
 */
export async function resolveSiteUrl(): Promise<string> {
  const configured =
    process.env.SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) {
    return `https://${production.replace(/\/+$/, "")}`;
  }

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  console.warn(
    "[password-reset] SITE_URL is not set — building links from the request host",
  );
  return `${protocol}://${host}`;
}

/** The link that goes in the email. */
export async function buildResetLink(token: string): Promise<string> {
  const base = await resolveSiteUrl();
  return `${base}/account/reset-password?token=${encodeURIComponent(token)}`;
}
