import { cache } from "react";
import { cookies } from "next/headers";
import {
  CUSTOMER_COOKIE,
  CUSTOMER_SESSION_MS,
  signToken,
  verifyToken,
  type SessionPayload,
} from "@/lib/auth-token";

/**
 * Customer sessions.
 *
 * Deliberately separate from `lib/session.ts` (admin): its own cookie, its own
 * lifetime, and no `redirect()` on failure — a shop page renders fine for a
 * signed-out visitor, so callers decide what an absent session means.
 */

/**
 * The 30-day lifetime lives in `lib/auth-token.ts` because `proxy.ts` slides it
 * forward on every visit — see `renewCustomerSession` there.
 */

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Add it to .env.local (see README / .env.example).",
    );
  }
  return secret;
}

export async function createCustomerSession(customerId: number): Promise<void> {
  const expiresAt = Date.now() + CUSTOMER_SESSION_MS;
  const token = await signToken(
    { sub: String(customerId), role: "customer", exp: expiresAt },
    getSecret(),
  );

  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(expiresAt),
    path: "/",
  });
}

export async function deleteCustomerSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_COOKIE);
}

/**
 * The signed-in customer's id, or `null`.
 *
 * Memoized per render pass, so a layout and its page share one cookie read.
 * The role is checked explicitly: admin tokens are signed with the same secret,
 * and only a `customer` token may stand for a customer id.
 */
export const getCustomerId = cache(async (): Promise<number | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_COOKIE)?.value;
  const payload: SessionPayload | null = await verifyToken(token, getSecret());

  if (!payload || payload.role !== "customer") {
    return null;
  }
  const id = Number(payload.sub);
  return Number.isInteger(id) && id > 0 ? id : null;
});
