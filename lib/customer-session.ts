import { cache } from "react";
import { cookies } from "next/headers";
import { getCustomerSessionEpoch, hasDatabase } from "@/lib/db";
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

/**
 * Issue a session cookie for `customerId`, stamped with the account's current
 * session generation (`sessionEpoch`).
 *
 * The generation is passed in rather than looked up here so the caller — which
 * has just read or written the customer row anyway — does not pay for a second
 * query. Callers that genuinely do not have it may omit it; the session then
 * counts as generation 1, which is what every pre-existing account has.
 */
export async function createCustomerSession(
  customerId: number,
  sessionEpoch = 1,
): Promise<void> {
  const expiresAt = Date.now() + CUSTOMER_SESSION_MS;
  const token = await signToken(
    {
      sub: String(customerId),
      role: "customer",
      exp: expiresAt,
      ver: sessionEpoch,
    },
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
 * Memoized per render pass, so a layout and its page share one cookie read —
 * and, now, one generation check.
 *
 * Three things must hold: the signature verifies (`verifyToken`), the role is
 * `customer` — admin tokens are signed with the same secret, so this is checked
 * explicitly — and the generation stamped into the token still matches the
 * account's. The last one costs one indexed lookup per request for a signed-in
 * visitor, and it is the difference between a session that can be revoked and
 * one that cannot.
 *
 * The generation check fails **open** on a database error: the shop is
 * browsable without a database, and a Neon hiccup must not sign every customer
 * out. It fails **closed** on a deleted account (`null` epoch), because there
 * is nothing left for the session to refer to.
 */
export const getCustomerId = cache(async (): Promise<number | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_COOKIE)?.value;
  const payload: SessionPayload | null = await verifyToken(token, getSecret());

  if (!payload || payload.role !== "customer") {
    return null;
  }
  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return (await isCurrentGeneration(id, payload.ver)) ? id : null;
});

async function isCurrentGeneration(
  id: number,
  tokenEpoch: number | undefined,
): Promise<boolean> {
  if (!hasDatabase()) {
    return true;
  }
  try {
    const current = await getCustomerSessionEpoch(id);
    if (current === null) {
      return false; // Account deleted — the cookie outlived its owner.
    }
    // A token from before this field existed carries no `ver`; treat it as the
    // generation every account starts at, so the migration logs nobody out.
    return (tokenEpoch ?? 1) >= current;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[customer-session] Generation check failed: ${message}`);
    return true;
  }
}
