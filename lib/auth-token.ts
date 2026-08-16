/**
 * Framework-agnostic session-token helpers.
 *
 * Intentionally free of `next/headers` and `server-only` so this module can be
 * imported from BOTH Server Actions and `proxy.ts` (the Next.js 16 replacement
 * for middleware). Signing uses the Web Crypto API (HMAC-SHA256), which is
 * available in the Edge and Node runtimes alike — no external dependency.
 *
 * The token is a minimal signed envelope: `base64url(payload).base64url(sig)`.
 */

export const SESSION_COOKIE = "panh_session";

/**
 * Customer sessions use their own cookie, not the admin one.
 *
 * Two separate cookies mean a customer token can never be presented where an
 * admin token is read, so the admin guard cannot be reached with a customer
 * login even if a role check were ever missed. `verifySession` checks the role
 * as well — defence in depth, since both cookies are signed with the same key.
 */
export const CUSTOMER_COOKIE = "panh_customer";

export type SessionRole = "admin" | "customer";

/**
 * How long a customer stays signed in. Shoppers return infrequently; an
 * admin-style short expiry would just annoy them.
 *
 * Lives here rather than in `lib/customer-session.ts` so `proxy.ts` can read it
 * without pulling in `next/headers`.
 */
export const CUSTOMER_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * How much of that lifetime may be spent before the proxy issues a fresh
 * cookie. A shopper who visits at least once every 25 days therefore never
 * meets the hard expiry, while a cookie left untouched still dies on schedule.
 */
export const CUSTOMER_RENEW_AFTER_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export interface SessionPayload {
  /** Subject — the admin username, or the customer's numeric id as a string. */
  sub: string;
  role: SessionRole;
  /** Absolute expiry, milliseconds since epoch. */
  exp: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded =
    input.length % 4 === 0
      ? input
      : input + "=".repeat(4 - (input.length % 4));
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Sign a payload into a `data.signature` token string. */
export async function signToken(
  payload: SessionPayload,
  secret: string,
): Promise<string> {
  const data = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data),
  );
  return `${data}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Verify a token's signature and expiry.
 * Returns the payload when valid, or `null` for any tampering/expiry/format issue.
 * `crypto.subtle.verify` compares the signature in constant time.
 */
export async function verifyToken(
  token: string | undefined,
  secret: string,
): Promise<SessionPayload | null> {
  if (!token || !secret) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [data, signature] = parts;

  try {
    const key = await importKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signature),
      encoder.encode(data),
    );
    if (!valid) {
      return null;
    }

    const payload = JSON.parse(
      decoder.decode(base64UrlDecode(data)),
    ) as SessionPayload;

    if (
      typeof payload.exp !== "number" ||
      Number.isNaN(payload.exp) ||
      Date.now() > payload.exp
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
