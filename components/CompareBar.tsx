"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, X } from "lucide-react";
import { useCompare } from "@/context/CompareContext";

/**
 * Floating entry point to /compare, shown once something is selected.
 *
 * Without it the comparison list would be invisible: the customer selects
 * products on the catalog and has no way to reach the table.
 */
export default function CompareBar() {
  const { ids, clear, ready } = useCompare();
  const pathname = usePathname();

  // Nothing to announce, not hydrated yet, or already on the page itself.
  if (!ready || ids.length === 0 || pathname === "/compare") {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-stone-300 bg-white px-2 py-2 shadow-lg">
      <Link
        href="/compare"
        className="flex items-center gap-2 rounded-full bg-accent-500 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-accent-600"
      >
        <BarChart3 className="h-4 w-4" aria-hidden="true" />
        Порівняти
        <span className="rounded-full bg-white/25 px-2 text-xs">
          {ids.length}
        </span>
      </Link>
      <button
        type="button"
        onClick={clear}
        aria-label="Очистити порівняння"
        title="Очистити порівняння"
        className="flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
