import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth-token";

/**
 * Next.js 16 renamed Middleware to Proxy (same functionality, file is `proxy.ts`
 * at the project root). This runs an *optimistic* auth check: it only reads and
 * verifies the signed cookie — no database, no slow work — and redirects.
 *
 * The authoritative check still lives in the admin layout via `verifySession()`.
 */
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifyToken(token, process.env.SESSION_SECRET ?? "");

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isLoginRoute = pathname === "/login";

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/login"],
};
