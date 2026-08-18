import { NextResponse, type NextRequest } from "next/server";
import {
  CUSTOMER_COOKIE,
  CUSTOMER_RENEW_AFTER_MS,
  CUSTOMER_SESSION_MS,
  SESSION_COOKIE,
  signToken,
  verifyToken,
} from "@/lib/auth-token";
import {
  buildContentSecurityPolicy,
  createNonce,
} from "@/lib/security-headers";

/**
 * Next.js 16 renamed Middleware to Proxy (same functionality, file is `proxy.ts`
 * at the project root). Three jobs, in order of how often they matter:
 *
 *  1. Content-Security-Policy. It carries a per-request nonce, so it cannot be
 *     declared in `next.config.ts` — see `lib/security-headers.ts`.
 *  2. Keeping a returning customer signed in (see `renewCustomerSession`).
 *  3. An *optimistic* admin auth check: it only reads and verifies the signed
 *     cookie — no database, no slow work — and redirects. The authoritative
 *     check still lives in the admin layout via `verifySession()`.
 */
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const secret = process.env.SESSION_SECRET ?? "";

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isLoginRoute = pathname === "/login";

  if (isAdminRoute || isLoginRoute) {
    const token = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value, secret);
    // Both cookies are signed with the same secret, so the role is what
    // separates an admin token from a customer's — checking only the signature
    // would let a customer token through this gate. The admin layout checks it
    // again; this keeps the two answers consistent.
    const session = token?.role === "admin" ? token : null;

    // Unauthenticated users may not see the admin panel.
    if (isAdminRoute && !session) {
      const loginUrl = new URL("/login", req.nextUrl);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Already-authenticated users skip the login page.
    if (isLoginRoute && session) {
      return NextResponse.redirect(new URL("/admin", req.nextUrl));
    }
  }

  // Next.js reads the nonce back out of the *request* header while rendering,
  // and stamps it onto every script it emits; the same value goes out on the
  // response so the browser accepts exactly those scripts.
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  await renewCustomerSession(req, response, secret);
  return response;
}

/**
 * Slide a customer's 30-day cookie forward while they keep visiting.
 *
 * Without this the cookie expires 30 days after sign-in no matter how active
 * the shopper is, so a regular customer gets logged out mid-visit for no
 * reason. Re-signing only once the cookie is more than
 * `CUSTOMER_RENEW_AFTER_MS` old keeps this to roughly one extra cookie write
 * per work-week rather than one per page view.
 *
 * Never throws: a session that cannot be renewed is still a valid session
 * until its original expiry.
 */
async function renewCustomerSession(
  req: NextRequest,
  response: NextResponse,
  secret: string,
): Promise<void> {
  const token = req.cookies.get(CUSTOMER_COOKIE)?.value;
  if (!token || !secret) {
    return;
  }

  try {
    const payload = await verifyToken(token, secret);
    if (!payload || payload.role !== "customer") {
      return;
    }
    const remaining = payload.exp - Date.now();
    if (remaining > CUSTOMER_SESSION_MS - CUSTOMER_RENEW_AFTER_MS) {
      return; // Issued recently — nothing to do.
    }

    const expiresAt = Date.now() + CUSTOMER_SESSION_MS;
    // `ver` is copied, never re-read: the proxy runs on every request and must
    // stay database-free. A renewal therefore extends a session without ever
    // promoting a retired one — `getCustomerId` still compares the generation
    // against the account before the cookie is worth anything.
    const renewed = await signToken(
      { sub: payload.sub, role: "customer", exp: expiresAt, ver: payload.ver },
      secret,
    );
    response.cookies.set(CUSTOMER_COOKIE, renewed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: new Date(expiresAt),
      path: "/",
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[proxy] Customer session renewal failed: ${message}`);
  }
}

export const config = {
  matcher: [
    // Auth-critical routes: matched unconditionally, prefetches included, so a
    // prefetch can never be the request that skips the admin redirect.
    "/admin",
    "/admin/:path*",
    "/login",
    /*
     * Everything else, for the CSP. Excludes:
     *  - api          — JSON, gets its own policy from `next.config.ts`
     *  - _next/static — build output, already immutable
     *  - _next/image  — the image optimizer
     *  - favicon.ico  — no markup to protect
     * and skips `next/link` prefetches, which render no document.
     */
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
