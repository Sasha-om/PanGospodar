import Link from "next/link";
import { Heart, LogOut, Package } from "lucide-react";
import { logoutCustomer } from "@/app/actions/customer-auth";
import PageHeader from "@/components/PageHeader";

/**
 * Chrome shared by every account page: the header, the section tabs and the
 * sign-out control. Rendered on the server — the only interactive part is the
 * sign-out form, which posts to a Server Action.
 */
export default function AccountShell({
  active,
  name,
  email,
  orderCount,
  favoriteCount,
  children,
}: {
  active: "orders" | "favorites";
  name: string;
  email: string;
  orderCount: number;
  favoriteCount: number;
  children: React.ReactNode;
}) {
  const tabs = [
    {
      id: "orders" as const,
      href: "/account",
      label: "Мої замовлення",
      icon: Package,
      count: orderCount,
    },
    {
      id: "favorites" as const,
      href: "/account/favorites",
      label: "Улюблені",
      icon: Heart,
      count: favoriteCount,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Особистий кабінет"
        subtitle={name ? `Вітаємо, ${name}!` : email}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-2" aria-label="Розділи кабінету">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === active;
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    isActive
                      ? "bg-stone-950 text-white"
                      : "bg-white text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 text-xs font-semibold ${
                      isActive ? "bg-white/20" : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {tab.count}
                  </span>
                </Link>
              );
            })}
          </nav>

          <form action={logoutCustomer}>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-sm border border-stone-300 px-4 py-2 text-sm font-bold text-stone-600 transition-colors hover:border-red-300 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Вийти
            </button>
          </form>
        </div>

        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
