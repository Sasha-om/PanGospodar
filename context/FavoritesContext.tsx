"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { syncFavorites, toggleFavorite } from "@/app/actions/favorites";

/**
 * Favourites, for guests and signed-in customers alike.
 *
 * A guest's list lives in `localStorage` so the heart works without an account.
 * Once signed in, the account is the source of truth: the stored list is merged
 * into it on the first render and the local copy is cleared, so the two can
 * never drift apart afterwards.
 */

const STORAGE_KEY = "pangospodar:favorites";

interface FavoritesContextValue {
  skus: string[];
  isFavorite: (sku: string) => boolean;
  toggle: (sku: string) => void;
  count: number;
  /** False until storage has been read — avoids an SSR/hydration mismatch. */
  ready: boolean;
  signedIn: boolean;
}

const FavoritesContext = createContext<FavoritesContextValue | undefined>(
  undefined,
);

function readStored(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((sku): sku is string => typeof sku === "string")
      : [];
  } catch {
    return [];
  }
}

export function FavoritesProvider({
  children,
  signedIn,
  initialSkus,
}: {
  children: React.ReactNode;
  /** Resolved on the server from the session cookie. */
  signedIn: boolean;
  /** The account's saved list, empty for guests. */
  initialSkus: string[];
}) {
  const [skus, setSkus] = useState<string[]>(initialSkus);
  const [ready, setReady] = useState(false);
  const merged = useRef(false);

  // Adopt the stored list on mount. For a signed-in customer this is also the
  // moment the guest list is folded into the account and the local copy
  // dropped; for a guest it is simply the list itself.
  useEffect(() => {
    const stored = readStored();

    if (!signedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSkus(stored);
      setReady(true);
      return;
    }

    if (merged.current) {
      setReady(true);
      return;
    }
    merged.current = true;

    if (stored.length === 0) {
      setReady(true);
      return;
    }

    let active = true;
    void syncFavorites(stored).then((result) => {
      if (!active) return;
      if (result.ok && result.skus) {
        setSkus(result.skus);
        // Merged server-side — keeping the local copy would resurrect deletions.
        window.localStorage.removeItem(STORAGE_KEY);
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [signedIn]);

  // Guests persist locally. Signed-in customers must not: their list lives in
  // the database, and a stale local copy would be re-merged on the next visit.
  useEffect(() => {
    if (!ready || signedIn) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(skus));
    } catch {
      // Private mode / quota — the in-memory list still works this session.
    }
  }, [skus, ready, signedIn]);

  const toggle = useCallback(
    (sku: string) => {
      if (!sku) return;
      let desired = false;
      // Optimistic: the heart must respond instantly, server round trip or not.
      setSkus((current) => {
        const has = current.includes(sku);
        desired = !has;
        return has ? current.filter((item) => item !== sku) : [sku, ...current];
      });

      if (!signedIn) return;
      void toggleFavorite(sku, desired).then((result) => {
        // Reconcile with the server's list; on failure the optimistic state
        // stays, and the next page load reads the truth from the account.
        if (result.ok && result.skus) {
          setSkus(result.skus);
        }
      });
    },
    [signedIn],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      skus,
      isFavorite: (sku: string) => skus.includes(sku),
      toggle,
      count: skus.length,
      ready,
      signedIn,
    }),
    [skus, toggle, ready, signedIn],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within a FavoritesProvider");
  }
  return context;
}

/** The guest list, for forms that carry it through a sign-in. */
export function readGuestFavorites(): string[] {
  if (typeof window === "undefined") return [];
  return readStored();
}
