import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import type { SessionPayload } from "@/lib/auth-token";

/**
 * Data Access Layer guard. Verifies the session on the server and redirects to
 * `/login` when absent. Memoized per render pass via React `cache`, so calling
 * it from a layout and a page in the same request only reads the cookie once.
 *
 * This is the authoritative check (recommended by the Next.js auth guide);
 * `proxy.ts` only performs an optimistic pre-filter.
 */
export const verifySession = cache(async (): Promise<SessionPayload> => {
  const session = await getSession();
  // The role is checked, not just the signature: customer sessions are signed
  // with the same secret, so a valid token alone must never imply admin.
  if (!session || session.role !== "admin") {
    redirect("/login");
  }
  return session;
});
