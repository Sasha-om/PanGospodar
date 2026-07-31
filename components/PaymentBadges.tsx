import { Banknote, CreditCard, Mailbox, Package } from "lucide-react";

/**
 * Delivery & payment reassurance badges.
 *
 * Deliberately text-based with generic icons — we name the services we work
 * with rather than reproducing their trademarked logos.
 */

const deliveryBadges = [
  { label: "Нова Пошта", icon: Package },
  { label: "Укрпошта", icon: Mailbox },
];

const paymentBadges = [
  { label: "Visa", icon: CreditCard },
  { label: "Mastercard", icon: CreditCard },
  { label: "Готівка при отриманні", icon: Banknote },
];

export default function PaymentBadges({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-8 gap-y-4 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
          Доставка
        </span>
        {deliveryBadges.map(({ label, icon: Icon }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-sm border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700"
          >
            <Icon className="h-4 w-4 text-accent-500" aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
          Оплата
        </span>
        {paymentBadges.map(({ label, icon: Icon }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-sm border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700"
          >
            <Icon className="h-4 w-4 text-accent-500" aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Compact icon-only row for the footer bottom bar. */
export function PaymentBadgesCompact() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {["Visa", "Mastercard", "Готівка"].map((label) => (
        <span
          key={label}
          className="inline-flex items-center gap-1.5 rounded-sm border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-600"
        >
          <CreditCard className="h-3.5 w-3.5 text-accent-500" aria-hidden="true" />
          {label}
        </span>
      ))}
    </div>
  );
}
