import Link from "next/link";
import { Clock, Mail, MapPin, Phone, Store } from "lucide-react";
import { PaymentBadgesCompact } from "@/components/PaymentBadges";
import SocialLinks from "@/components/SocialLinks";
import { categories } from "@/lib/products";

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-stone-100 text-stone-600">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
        <div>
          <span className="text-lg font-extrabold text-accent-500">
            PanGospodar
          </span>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-accent-600">
            Надійні інструменти для вашого господарства
          </p>
          <p className="mt-3 max-w-xs text-sm text-stone-500">
            Господарські та садові інструменти для дому, дачі та майстерні.
            Перевірені бренди, офіційна гарантія.
          </p>
          <ul className="mt-4 flex flex-col gap-2 text-sm text-stone-500">
            <li className="flex items-start gap-2">
              <MapPin
                className="mt-0.5 h-4 w-4 shrink-0 text-accent-500"
                aria-hidden="true"
              />
              <div>
                <span>вул. Центральна, 74, смт Ратне, Волинська обл., 44100</span>
                <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                  <Store className="h-3.5 w-3.5" aria-hidden="true" />
                  Самовивіз із магазину
                </span>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <Phone
                className="mt-0.5 h-4 w-4 shrink-0 text-accent-500"
                aria-hidden="true"
              />
              <div>
                <a
                  href="tel:+380673413751"
                  className="font-semibold transition-colors hover:text-accent-600"
                >
                  +38 (067) 341-37-51
                </a>
                <span className="mt-1 flex items-start gap-1.5 text-xs text-stone-500">
                  <Clock
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400"
                    aria-hidden="true"
                  />
                  Пн-Пт: 08:30 - 18:00, Сб: 09:00 - 15:00
                </span>
              </div>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-accent-500" aria-hidden="true" />
              <a
                href="mailto:pangospod@gmail.com"
                className="font-semibold transition-colors hover:text-accent-600"
              >
                pangospod@gmail.com
              </a>
            </li>
          </ul>

          <div className="mt-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-800">
              Ми в соцмережах
            </h3>
            <div className="mt-3">
              <SocialLinks variant="light" />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-stone-800">
            Категорії
          </h3>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/category/${category.slug}`}
                  className="transition-colors hover:text-accent-600"
                >
                  {category.name}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/catalog"
                className="font-semibold text-accent-600 transition-colors hover:text-accent-700"
              >
                Усі товари
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-stone-800">
            Інформація
          </h3>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <Link href="/about" className="transition-colors hover:text-accent-600">
                Про нас
              </Link>
            </li>
            <li>
              <Link
                href="/delivery"
                className="transition-colors hover:text-accent-600"
              >
                Доставка та оплата
              </Link>
            </li>
            <li>
              <Link
                href="/warranty"
                className="transition-colors hover:text-accent-600"
              >
                Гарантія та повернення
              </Link>
            </li>
            <li>
              <Link
                href="/contacts"
                className="transition-colors hover:text-accent-600"
              >
                Контакти
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-stone-200 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-stone-400">
            © {new Date().getFullYear()} ПанГосподар. Усі права захищені.
          </p>
          <PaymentBadgesCompact />
        </div>
      </div>
    </footer>
  );
}
