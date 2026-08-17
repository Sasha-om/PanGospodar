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

/** `localhost:3000`, `127.0.0.1:3000`, … — the only hosts dev may invent. */
function isLocalHost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
}

/** A host is only usable in a link if it is a plain `name[:port]`. */
function isWellFormedHost(host: string): boolean {
  return /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host);
}

/**
 * Absolute base URL for links that leave the site (reset emails).
 *
 * Configuration first, request second, and deliberately so: a `Host` header is
 * attacker-controlled in the general case, and a reset link built from it would
 * point the customer's one-time token at whatever host the attacker asked for —
 * a full account takeover that needs nothing but the ability to submit the
 * "forgot password" form on the victim's behalf.
 *
 * So the request host is not merely a last resort, it is *checked* against the
 * hosts this deployment is actually known by (`SITE_URL`, the Vercel project
 * URLs, localhost in development). An unrecognised `Host` is discarded and the
 * first known origin is used instead, which is the difference between "Vercel
 * happens to reject foreign hosts for us" and "this app does not send links to
 * hosts it does not recognise".
 */
export async function resolveSiteUrl(): Promise<string> {
  const known = knownOrigins();
  if (known.length > 0) {
    return known[0];
  }

  // Nothing configured: fall back to the request, but only to a host that could
  // plausibly be this site — never to whatever arrived in the header.
  const headerList = await headers();
  const host = headerList.get("host")?.trim().toLowerCase() ?? "";
  const usable =
    host && isWellFormedHost(host) && (isLocalHost(host) || !isProduction());

  if (!usable) {
    console.error(
      `[password-reset] No SITE_URL and untrusted Host "${host}" — falling back to localhost. ` +
        "Set SITE_URL to the site's public origin.",
    );
    return "http://localhost:3000";
  }

  console.warn(
    "[password-reset] SITE_URL is not set — building links from the request host",
  );
  return `${isLocalHost(host) ? "http" : "https"}://${host}`;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Every origin this deployment legitimately answers on, most authoritative
 * first. Empty when nothing is configured (plain `next dev`, or a self-hosted
 * box that has not set `SITE_URL`).
 */
function knownOrigins(): string[] {
  const origins: string[] = [];
  const push = (value: string | undefined, withScheme = false) => {
    const clean = value?.trim().replace(/\/+$/, "");
    if (!clean) return;
    const origin = withScheme ? `https://${clean}` : clean;
    if (!origins.includes(origin)) origins.push(origin);
  };

  push(process.env.SITE_URL);
  push(process.env.NEXT_PUBLIC_SITE_URL);
  // The stable production domain of the Vercel project, then the URL of this
  // particular deployment (set on previews too).
  push(process.env.VERCEL_PROJECT_PRODUCTION_URL, true);
  push(process.env.VERCEL_URL, true);
  return origins;
}

/**
 * Can a link be built that is guaranteed to point at this site?
 *
 * False only in production with nothing configured — where the alternative
 * would be trusting the request's `Host`. The reset form checks this alongside
 * the mail credentials and says the feature is unconfigured, which is far
 * better than mailing a link that goes nowhere (or somewhere else).
 */
export function hasTrustedOrigin(): boolean {
  return knownOrigins().length > 0 || !isProduction();
}

/** The link that goes in the email. */
export async function buildResetLink(token: string): Promise<string> {
  const base = await resolveSiteUrl();
  return `${base}/account/reset-password?token=${encodeURIComponent(token)}`;
}
