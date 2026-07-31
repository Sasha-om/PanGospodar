"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { categories, getSubcategoriesByCategory } from "@/lib/products";

type NavItem = {
  key: string;
  label: string;
  slug: string | null;
  subs: { slug: string; name: string }[];
};

const NAV_ITEMS: NavItem[] = [
  { key: "all", label: "Усі товари", slug: null, subs: [] },
  ...categories.map((category) => ({
    key: category.slug,
    label: category.name,
    slug: category.slug,
    subs: getSubcategoriesByCategory(category.slug).map((sub) => ({
      slug: sub.slug,
      name: sub.name,
    })),
  })),
];

function categoryHref(slug: string | null): string {
  return slug ? `/catalog?category=${slug}` : "/catalog";
}

function subcategoryHref(categorySlug: string, subSlug: string): string {
  return `/catalog?category=${categorySlug}&sub=${subSlug}`;
}

/** Presentational bar — `activeKey` is empty ("") when nothing is highlighted. */
function NavBar({ activeKey }: { activeKey: string }) {
  return (
    <nav
      aria-label="Категорії товарів"
      className="border-b border-stone-200 bg-white"
    >
      <ul className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-2 py-1.5 sm:px-6 lg:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === activeKey;
          const hasMenu = item.subs.length > 0;
          return (
            <li key={item.key} className="group relative">
              <Link
                href={categoryHref(item.slug)}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-1 whitespace-nowrap rounded-sm px-3.5 py-2 text-sm transition-colors duration-100 ${
                  isActive
                    ? "bg-accent-500 font-bold text-white"
                    : "font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-800"
                }`}
              >
                {item.label}
                {hasMenu ? (
                  <ChevronDown
                    className={`hidden h-3.5 w-3.5 transition-transform duration-100 group-hover:rotate-180 lg:block ${
                      isActive ? "text-white" : "text-stone-400"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}
              </Link>

              {/* Mega-menu dropdown (desktop only — hover or keyboard focus) */}
              {hasMenu ? (
                <div className="invisible absolute left-0 top-full z-40 hidden pt-1 opacity-0 transition-opacity duration-100 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 lg:block">
                  <div
                    className={`rounded-sm border border-stone-200 bg-white p-2 shadow-lg ${
                      item.subs.length > 3 ? "grid w-[430px] grid-cols-2 gap-0.5" : "w-56"
                    }`}
                  >
                    {item.subs.map((sub) => (
                      <Link
                        key={sub.slug}
                        href={subcategoryHref(item.slug!, sub.slug)}
                        className="block rounded-sm px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors duration-100 hover:bg-accent-50 hover:text-accent-600"
                      >
                        {sub.name}
                      </Link>
                    ))}
                    <Link
                      href={categoryHref(item.slug)}
                      className={`block rounded-sm px-3 py-1.5 text-sm font-bold text-accent-600 transition-colors duration-100 hover:bg-accent-50 ${
                        item.subs.length > 3 ? "col-span-2" : ""
                      }`}
                    >
                      Усі товари категорії →
                    </Link>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CategoryNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = searchParams.get("category");

  // Only reflect an active category while on the catalog page.
  const activeKey = pathname === "/catalog" ? category ?? "all" : "";

  return <NavBar activeKey={activeKey} />;
}

export default function CategoryNav() {
  return <CategoryNavInner />;
}

/** Static fallback used while the search params resolve (keeps pages static). */
export function CategoryNavFallback() {
  return <NavBar activeKey="" />;
}
