import Link from "next/link";
import { Suspense } from "react";
import { Clock, Phone, User } from "lucide-react";
import CartBadge from "@/components/CartBadge";
import CategoryNav, { CategoryNavFallback } from "@/components/CategoryNav";
import SearchBar from "@/components/SearchBar";
import { getCustomerId } from "@/lib/customer-session";
import { getStoreSettings } from "@/lib/db";
import { hourSegments, telHref } from "@/lib/store-settings";

export default async function Header() {
  const settings = await getStoreSettings();
  const signedIn = (await getCustomerId()) !== null;
  // The top bar is tight, so only the first line of the schedule fits.
  const primaryHours = hourSegments(settings.hours)[0] ?? settings.hours;

  return (
    <header className="bg-white">
      {/* Trust top bar: contact phone + working hours */}
      <div className="border-b border-stone-200 bg-stone-100 text-stone-600">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-1.5 text-xs sm:justify-end sm:gap-6 sm:px-6">
          <a
            href={telHref(settings.phone)}
            className="flex items-center gap-1.5 font-semibold transition-colors duration-100 hover:text-accent-600"
          >
            <Phone className="h-3.5 w-3.5 text-accent-500" aria-hidden="true" />
            {settings.phone}
          </a>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-accent-500" aria-hidden="true" />
            {primaryHours}
          </span>
        </div>
      </div>

      {/* Main navigation */}
      <div className="bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 sm:gap-6 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 text-lg font-extrabold tracking-tight text-accent-500"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-500 text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M12 2C8 2 5 5.5 5 9.5c0 4 3.5 8 7 12.5 3.5-4.5 7-8.5 7-12.5C19 5.5 16 2 12 2Zm0 10a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
              </svg>
            </span>
            <span className="hidden sm:inline">PanGospodar</span>
          </Link>

          <Suspense fallback={<div className="flex-1" />}>
            <SearchBar />
          </Suspense>

          <Link
            href={signedIn ? "/account" : "/account/login"}
            aria-label={signedIn ? "Особистий кабінет" : "Вхід в кабінет"}
            title={signedIn ? "Особистий кабінет" : "Вхід в кабінет"}
            className="flex shrink-0 items-center gap-2 rounded-sm border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-700 transition-colors hover:border-accent-500 hover:text-accent-600"
          >
            <User className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">
              {signedIn ? "Кабінет" : "Увійти"}
            </span>
          </Link>

          <CartBadge />
        </div>
      </div>

      {/* Category sub-header navigation */}
      <Suspense fallback={<CategoryNavFallback />}>
        <CategoryNav />
      </Suspense>
    </header>
  );
}
