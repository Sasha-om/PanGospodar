"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Product comparison list.
 *
 * Only product ids are kept — the full rows already live in `ProductsContext`,
 * and storing them twice would let the comparison table show stale prices.
 *
 * Unlike the cart this survives a page reload: the flow is "collect items while
 * browsing, then open /compare", and losing the selection on a refresh makes
 * the feature useless.
 */

const STORAGE_KEY = "pangospodar:compare";

/** A wider table stops being readable, especially on a phone. */
export const MAX_COMPARE_ITEMS = 4;

interface CompareContextValue {
  ids: string[];
  isComparing: (id: string) => boolean;
  /** No-op when the list is already full. */
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  isFull: boolean;
  /** False until the stored list has been read, to avoid an SSR mismatch. */
  ready: boolean;
}

const CompareContext = createContext<CompareContextValue | undefined>(undefined);

function readStored(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  // Read after mount: the server rendered an empty list, so touching
  // localStorage during render would produce a hydration mismatch. Adopting
  // stored state on mount is exactly what this effect is for — the one render
  // it costs is the price of hydrating from an external store.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIds(readStored().slice(0, MAX_COMPARE_ITEMS));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Private mode or a full quota — the list simply will not persist.
    }
  }, [ids, ready]);

  const isComparing = useCallback((id: string) => ids.includes(id), [ids]);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= MAX_COMPARE_ITEMS) {
        return prev;
      }
      return [...prev, id];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setIds((prev) => prev.filter((item) => item !== id));
  }, []);

  const clear = useCallback(() => setIds([]), []);

  const value = useMemo(
    () => ({
      ids,
      isComparing,
      toggle,
      remove,
      clear,
      isFull: ids.length >= MAX_COMPARE_ITEMS,
      ready,
    }),
    [ids, isComparing, toggle, remove, clear, ready],
  );

  return (
    <CompareContext.Provider value={value}>{children}</CompareContext.Provider>
  );
}

export function useCompare() {
  const context = useContext(CompareContext);
  if (!context) {
    throw new Error("useCompare must be used within a CompareProvider");
  }
  return context;
}
