import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Where the caller's address is read from, most trustworthy first.
 *
 * ⚠️ This list is a statement about the *hosting platform*, not about HTTP.
 * Any client can put whatever it likes in `x-forwarded-for`; the header is only
 * worth anything because the edge in front of the app overwrites it. On Vercel
 * both entries below are set by the platform itself, and
 * `x-vercel-forwarded-for` in particular is not forwardable from outside —
 * which is why it is preferred over the generic header.
 *
 * If this site is ever moved behind something else (Cloudflare, an nginx
 * reverse proxy, a self-hosted box with no proxy at all), that new front end
 * MUST overwrite `x-forwarded-for` too, or the per-IP limits built on this
 * become trivially bypassable by sending a different fake address each time.
 * Add the platform's own trusted header to the front of this list when you do.
 */
const IP_HEADERS = [
  "x-vercel-forwarded-for",
  "x-forwarded-for",
  "x-real-ip",
] as const;

/** The left-most entry of `x-forwarded-for` is the original client. */
function firstAddress(value: string | null): string {
  return (value ?? "").split(",")[0]?.trim() ?? "";
}

/**
 * The caller's address, or `""` when none of the headers above carry one.
 *
 * Almost every caller wants `hashClientIp` instead — the raw value is for the
 * one case that must send it onward rather than store it: Cloudflare's
 * siteverify uses it to notice a challenge token replayed from somewhere else.
 */
export async function readClientIp(): Promise<string> {
  const headerList = await headers();
  for (const header of IP_HEADERS) {
    const ip = firstAddress(headerList.get(header));
    if (ip) {
      return ip;
    }
  }
  return "";
}

/**
 * Hash the caller's IP so a per-IP counter (login attempts, order limits) can
 * recognise a repeat caller without the database ever holding a real address.
 *
 * Salted with `SESSION_SECRET` — already required for either login to work at
 * all — so the stored digests are useless if a table ever leaks. Falls back to
 * `fallbackSalt` only for callers where the secret is optional.
 *
 * Returns `""` when no address is available, which every caller reads as "skip
 * the limit for this request" rather than lumping unrelated callers into one
 * shared bucket.
 */
export async function hashClientIp(fallbackSalt: string): Promise<string> {
  const ip = await readClientIp();
  if (!ip) {
    return "";
  }

  const salt = process.env.SESSION_SECRET ?? fallbackSalt;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/**
 * Hash any other identifier the same way, for limits that must survive a change
 * of address — a credential-stuffing run against one account from a botnet
 * looks like a different IP every time, but always the same email.
 *
 * Same salt, and a per-kind prefix so the digest of an email can never collide
 * with the digest of an address.
 */
export function hashIdentifier(kind: string, value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  const salt = process.env.SESSION_SECRET ?? "panhospodar";
  return createHash("sha256").update(`${salt}:${kind}:${trimmed}`).digest("hex");
}
