/**
 * The site's security response headers, in one place.
 *
 * Split between two callers on purpose:
 *   - `next.config.ts` sets everything that is the same for every response
 *     (framing, sniffing, HSTS…), because those need no per-request work.
 *   - `proxy.ts` sets the Content-Security-Policy, because that one carries a
 *     fresh nonce per request and therefore cannot come from static config.
 *
 * Kept free of `next/headers`, `node:*` and `server-only` so it can be imported
 * from the Node config loader and the Edge proxy alike.
 */

/**
 * A random, single-use value that marks the scripts *we* put on the page.
 *
 * Base64 of 16 random bytes: unguessable, and short enough that repeating it on
 * every script tag costs nothing. `crypto.getRandomValues` (not `Math.random`)
 * because the whole guarantee is that an attacker cannot predict it.
 */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Build the Content-Security-Policy for one request.
 *
 * `script-src` is the point of the exercise. It used to be `'unsafe-inline'`,
 * which tells the browser "run any inline script you find" — exactly what an
 * XSS payload needs, so the policy stopped almost nothing. Now only a script
 * carrying this request's nonce may run: Next.js reads the nonce out of this
 * very header and stamps it onto its own framework/page scripts, while an
 * injected `<script>` has no way to guess it. `'strict-dynamic'` lets the
 * nonced Next.js runtime load the chunks it needs without listing each one.
 *
 * `style-src` deliberately keeps `'unsafe-inline'`. React writes `style={{…}}`
 * props as inline style attributes (next/image relies on this), and CSP has no
 * nonce mechanism for attributes — locking it down would break the layout to
 * defend against CSS injection, which cannot execute code.
 *
 * `img-src` allows any `https:` host because the admin panel accepts arbitrary
 * product photo URLs (see `images.unoptimized` in `next.config.ts`).
 *
 * In development React evaluates code to rebuild server stack traces, and the
 * dev overlay injects its own styles — hence the two extra allowances, which
 * never reach production.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  isDev = process.env.NODE_ENV === "development",
): string {
  /**
   * The captcha's own host, and only while a site key is configured — an
   * unconfigured shop never loads that script, so its policy stays as narrow as
   * it was before Turnstile existed. `frame-src` is what the challenge widget
   * itself needs; the answer is verified server-to-server, which no browser
   * policy governs.
   */
  const turnstile = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
    ? "https://challenges.cloudflare.com"
    : "";

  return [
    "default-src 'self'",
    // The host is listed for browsers that ignore 'strict-dynamic'; where it is
    // honoured, the nonced Next.js runtime loading the script is what counts.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${turnstile ? ` ${turnstile}` : ""}${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "font-src 'self'",
    // The browser talks only to this origin: the catalog API, the Nova Poshta
    // proxy routes and the Server Actions all live under it.
    `connect-src 'self'${turnstile ? ` ${turnstile}` : ""}${isDev ? " ws: http://localhost:*" : ""}`,
    `frame-src ${turnstile || "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Everything that is identical on every response.
 *
 * No CSP here — see the module comment. A request that somehow bypasses the
 * proxy still gets these, so framing and sniffing protection never depends on
 * the matcher being right.
 */
export const staticSecurityHeaders = [
  // Belt-and-suspenders alongside `frame-ancestors`, for browsers that predate
  // that CSP directive.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing on the site uses these browser features; deny them outright.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Vercel always serves over HTTPS, so this never blocks a legitimate plain
  // request — it just stops a downgrade to HTTP from being accepted later.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
] as const;

/**
 * CSP for the JSON API routes, which the proxy does not run on.
 *
 * They return data, never markup, so nothing needs to load: `default-src
 * 'none'` plus a framing ban is the whole policy.
 */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";
