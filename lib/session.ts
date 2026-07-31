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

/** Read and verify the current session, or `null` if not signed in. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return verifyToken(token, getSecret());
}
