import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  signToken,
  verifyToken,
  type SessionPayload,
} from "@/lib/auth-token";

/** How long a login stays valid. */
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Add it to .env.local (see README / .env.example).",
    );
  }
  return secret;
}

/** Create a signed session cookie for the given admin user. */
export async function createSession(username: string): Promise<void> {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const token = await signToken(
    { sub: username, role: "admin", exp: expiresAt },
    getSecret(),
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(expiresAt),
    path: "/",
  });
}

/** Remove the session cookie (logout). */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Read and verify the current **admin** session, or `null`.
 *
 * The role is part of the check, not an extra someone may remember to add: the
 * customer cookie is signed with the same `SESSION_SECRET`, so a valid
 * signature alone says only "this site issued this token", never "this token
 * belongs to the admin". A signed-in customer can read their own cookie in
 * their own browser and present its value under this cookie's name — every
 * caller that trusted a non-null result was one such request away from handing
 * over the admin panel's API.
 *
 * Kept here rather than at the call sites so a new admin endpoint is safe by
 * default; `verifySession` in `lib/dal.ts` checks the role again on top.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const payload = await verifyToken(token, getSecret());
  return payload?.role === "admin" ? payload : null;
}
