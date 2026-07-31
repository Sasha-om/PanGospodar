"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";

export default function CartBadge() {
  const { totalItems } = useCart();

  return (
    <Link
      href="/cart"
      aria-label="Кошик"
      className="relative flex shrink-0 items-center justify-center rounded-full p-2 text-stone-700 transition-colors duration-100 hover:bg-stone-100 hover:text-stone-800"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-6 w-6"
        aria-hidden="true"
      >
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"
        />
      </svg>
      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-500 text-[10px] font-bold text-white">
        {totalItems}
      </span>
    </Link>
  );
}
