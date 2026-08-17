"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The Cloudflare Turnstile challenge, rendered inside whatever form contains it.
 *
 * Renders nothing at all when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset — the
 * third-party script is not even requested — so an unconfigured site behaves
 * exactly as it did before this component existed.
 *
 * The widget writes its answer into a hidden `cf-turnstile-response` input it
 * adds to the surrounding form, which is how the value reaches the Server
 * Action. The server re-checks that answer with Cloudflare regardless of
 * anything decided here: this component is convenience, never enforcement.
 */

/** The subset of the Turnstile API this component uses. */
interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: { sitekey: string; theme?: "light" | "dark" | "auto" },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export default function TurnstileWidget({
  hint = "Через кілька невдалих спроб ми просимо підтвердити, що ви не робот.",
}: {
  /** Why the visitor is being asked — the reason differs per form. */
  hint?: string;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  /**
   * Set once the script reports in. Rendering is explicit rather than via the
   * usual `class="cf-turnstile"` auto-scan: the widget mounts on demand (after
   * a failed attempt), long after Turnstile has finished scanning the page, so
   * auto-render would simply never see it.
   */
  const [ready, setReady] = useState(false);

  const mount = useCallback(() => {
    const container = containerRef.current;
    if (!container || !window.turnstile || widgetIdRef.current) {
      return;
    }
    widgetIdRef.current = window.turnstile.render(container, {
      sitekey: siteKey,
      theme: "light",
    });
  }, [siteKey]);

  // The script may already be on the page from an earlier mount of this
  // component, in which case `onReady` never fires again. Adopting the state of
  // an external store on mount is what this effect is for.
  useEffect(() => {
    if (!siteKey || ready || !window.turnstile) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, [siteKey, ready]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    mount();

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [ready, mount]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Script
        id="cf-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <div ref={containerRef} />
      <p className="text-xs text-stone-500">{hint}</p>
    </div>
  );
}
