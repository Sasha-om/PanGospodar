import Link from "next/link";
import { Boxes, Check, ShieldCheck, Truck } from "lucide-react";
import HeroShowcase from "@/components/HeroShowcase";
import PaymentBadges from "@/components/PaymentBadges";
import RecommendedProducts from "@/components/RecommendedProducts";
import TrustedBrands from "@/components/TrustedBrands";

const heroChecks = [
  "Оплата при отриманні",
  "Перевірка перед відправкою",
  "Офіційна гарантія",
];

const trustBadges = [
  {
    icon: Boxes,
    value: "Провідні бренди",
    label: "надійні інструменти для роботи",
  },
  {
    icon: ShieldCheck,
    value: "до 24 місяців",
    label: "офіційна гарантія",
  },
  {
    icon: Truck,
    value: "1-3 дні",
    label: "доставка по Україні",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      {/* Hero on the warm kraft base */}
      <section className="border-b border-stone-200">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-accent-500">
              PanGospodar
            </p>
            <h1 className="mt-2 max-w-2xl text-3xl font-extrabold text-stone-800 sm:text-4xl">
              Надійний інструмент для роботи та господарства
            </h1>
            <p className="mt-3 max-w-2xl text-stone-600">
              Бензо- та електроінструменти для саду, городу та майстерні.
              Перевірені моделі провідних брендів з офіційною гарантією.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/catalog"
                className="rounded-sm bg-accent-500 px-6 py-2.5 text-sm font-bold text-white transition-colors duration-100 hover:bg-accent-600"
              >
                Переглянути каталог
              </Link>
              <Link
                href="/delivery"
                className="rounded-sm border border-stone-300 bg-white px-6 py-2.5 text-sm font-bold text-stone-800 transition-colors duration-100 hover:border-accent-500 hover:text-accent-600"
              >
                Доставка та оплата
              </Link>
            </div>

            {/* Checkmark trust badges */}
            <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              {heroChecks.map((check) => (
                <li
                  key={check}
                  className="flex items-center gap-1.5 text-sm font-medium text-stone-600"
                >
                  <Check
                    className="h-4 w-4 shrink-0 text-emerald-600"
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                  {check}
                </li>
              ))}
            </ul>
          </div>

          <div className="hidden lg:block">
            <HeroShowcase />
          </div>
        </div>
      </section>

      {/* Trust & service highlights */}
      <section className="border-b border-stone-200">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {trustBadges.map((badge) => {
              const Icon = badge.icon;
              return (
                <div
                  key={badge.label}
                  className="flex items-center gap-3 rounded-sm border border-stone-200 bg-white p-4 transition-colors duration-100 hover:border-accent-500"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-accent-50 text-accent-600">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-sm font-extrabold leading-snug text-stone-800">
                      {badge.value}
                    </dt>
                    <dd className="mt-0.5 text-xs leading-relaxed text-stone-500">
                      {badge.label}
                    </dd>
                  </div>
                </div>
              );
            })}
          </dl>

          <PaymentBadges className="mt-6 border-t border-stone-200 pt-6" />
        </div>
      </section>

      <TrustedBrands />

      <main className="flex-1">
        <RecommendedProducts />
      </main>
    </div>
  );
}
