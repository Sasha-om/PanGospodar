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

export interface SessionPayload {
  /** Subject — the admin username. */
  sub: string;
  /** Coarse role, reserved for future permission checks. */
  role: "admin";
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
