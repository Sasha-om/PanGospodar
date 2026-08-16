/**
 * Cloudflare Turnstile — the captcha the rate limits cannot replace.
 *
 * `lib/login-rate-limit.ts` caps how fast one address or one account may be
 * guessed at, but a stuffing run that tries a single leaked password against a
 * thousand *different* accounts stays under every one of those budgets. A
 * challenge is the only thing that separates "a script" from "a person" there.
 *
 * OPTIONAL, and completely inert until both keys are set — see README.md.
 * Nothing on the site changes shape, no third-party script is loaded, and the
 * CSP stays as narrow as it is today while the keys are absent.
 *
 * Turnstile is the choice over hCaptcha/reCAPTCHA because it needs no account
 * beyond a Cloudflare login, has a free tier with no volume ceiling worth
 * worrying about for a shop this size, and does not profile the visitor.
 */

/** Public key. Safe in the browser bundle — it identifies the widget, nothing more. */
export function turnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
}

/**
 * Is the challenge configured?
 *
 * Both halves are required: a site key with no secret would render a widget
 * whose answer nobody checks — worse than no captcha, because it looks like
 * protection. Server-side only; the client component checks the site key alone,
 * and the server is what actually enforces.
 */
export function isTurnstileEnabled(): boolean {
  return Boolean(turnstileSiteKey() && process.env.TURNSTILE_SECRET_KEY?.trim());
}

/** The field Turnstile writes its answer into, inside the surrounding form. */
export const TURNSTILE_FIELD = "cf-turnstile-response";

export const CAPTCHA_FAILED =
  "Підтвердіть, що ви не робот, і спробуйте ще раз.";

interface SiteVerifyResponse {
  success?: boolean;
  "error-codes"?: string[];
}

/**
 * Ask Cloudflare whether this token is a real, unused answer to a challenge
 * we issued.
 *
 * Fails **closed**, unlike the rate limiter: this runs only when the caller has
 * already collected several failed attempts, so treating a network hiccup as
 * "let them through" would hand an attacker a way to skip the challenge by
 * making the check fail. A rare false rejection on the retry of an already
 * failing login is the cheaper mistake.
 *
 * `remoteIp` is optional — Cloudflare uses it to spot a token replayed from a
 * different address.
 */
export async function verifyTurnstile(
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !token) {
    return false;
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) {
      body.set("remoteip", remoteIp);
    }

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        // A login must not hang on a third party being slow.
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = (await response.json()) as SiteVerifyResponse;
    if (result.success !== true) {
      console.warn(
        `[turnstile] Rejected: ${(result["error-codes"] ?? []).join(", ") || "no reason given"}`,
      );
      return false;
    }
    return true;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[turnstile] Verification failed: ${message}`);
    return false;
  }
}
