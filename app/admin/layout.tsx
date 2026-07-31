import { verifySession } from "@/lib/dal";

/**
 * Server-side authorization gate for every `/admin` route. Runs `verifySession()`
 * on the server before any admin UI renders; unauthenticated requests are
 * redirected to `/login`. This is independent of `proxy.ts`, so the panel stays
 * protected even if the optimistic proxy check is ever bypassed.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await verifySession();
  return <>{children}</>;
}
