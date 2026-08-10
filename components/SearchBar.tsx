"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(urlQuery);
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);

  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setQuery(urlQuery);
  }

  function updateQuery(value: string) {
    setQuery(value);
    setSyncedQuery(value);
    const params = new URLSearchParams();
    // Preserve an active category filter so search and category compose.
    const category = searchParams.get("category");
    if (category) {
      params.set("category", category);
    }
    if (value.trim()) {
      params.set("q", value);
    }
    const queryString = params.toString();
    // The full catalog lives on /catalog — searching always lands there.
    router.replace(`/catalog${queryString ? `?${queryString}` : ""}`, {
      scroll: false,
    });
  }

  return (
    <form
      role="search"
      className="flex flex-1 items-center"
      onSubmit={(event) => {
        event.preventDefault();
        updateQuery(query);
      }}
    >
      <label htmlFor="site-search" className="sr-only">
        Пошук товарів
      </label>
      <div className="flex w-full overflow-hidden rounded-sm border border-stone-300 bg-white focus-within:border-accent-500 focus-within:ring-1 focus-within:ring-accent-500/40">
        <input
          id="site-search"
          name="q"
          type="search"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          placeholder="Пошук за назвою, кодом або артикулом..."
          className="w-full bg-transparent px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none"
        />
        <button
          type="submit"
          className="flex items-center justify-center bg-accent-500 px-4 text-sm font-semibold text-white transition-colors duration-100 hover:bg-accent-600"
          aria-label="Пошук"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-4 w-4"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </form>
  );
}
