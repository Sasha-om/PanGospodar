import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";

export default async function OrderSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const orderId = id && /^\d+$/.test(id) ? id : null;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader title="Замовлення прийнято" />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-4 px-4 py-16 text-center sm:px-6">
        <CheckCircle2
          className="h-14 w-14 text-emerald-600"
          aria-hidden="true"
        />

        <h2 className="text-2xl font-extrabold text-stone-800">
          Дякуємо за замовлення!
        </h2>

        {orderId ? (
          <p className="text-stone-600">
            Номер вашого замовлення —{" "}
            <span className="font-bold text-stone-800">#{orderId}</span>.
            Збережіть його для звернень.
          </p>
        ) : null}

        <p className="max-w-md text-stone-600">
          Ми вже отримали заявку й зв&apos;яжемося з вами найближчим часом
          обраним способом, щоб підтвердити деталі доставки та оплати.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/catalog"
            className="rounded-sm bg-accent-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-accent-600"
          >
            Продовжити покупки
          </Link>
          <Link
            href="/contacts"
            className="rounded-sm border border-stone-300 bg-white px-6 py-3 text-sm font-bold text-stone-800 transition-colors hover:border-accent-500 hover:text-accent-600"
          >
            Наші контакти
          </Link>
        </div>
      </main>
    </div>
  );
}
