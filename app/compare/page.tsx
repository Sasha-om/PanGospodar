"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BarChart3, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useCompare } from "@/context/CompareContext";
import { useProducts } from "@/context/ProductsContext";
import {
  getProductAttributes,
  getProductBadges,
  type Product,
} from "@/lib/products";

/** A characteristic and its value for each compared product ("—" when absent). */
interface CompareRow {
  label: string;
  values: string[];
  /** False when every product has the same value. */
  differs: boolean;
}

function buildRows(products: Product[]): CompareRow[] {
  const attributesPerProduct = products.map(
    (product) => new Map(getProductAttributes(product)),
  );

  // Fixed rows first, then every characteristic that occurs on any product.
  const fixed: CompareRow[] = [
    {
      label: "Ціна",
      values: products.map((p) => `${p.price.toLocaleString("uk-UA")} ₴`),
      differs: false,
    },
    { label: "Бренд", values: products.map((p) => p.brand || "—"), differs: false },
    { label: "Код", values: products.map((p) => p.sku ?? p.id), differs: false },
    {
      label: "Артикул",
      values: products.map((p) => p.barcode || "—"),
      differs: false,
    },
    {
      label: "Наявність",
      values: products.map((p) =>
        p.inStock === false
          ? "Немає"
          : typeof p.quantity === "number"
            ? `${p.quantity} шт.`
            : "В наявності",
      ),
      differs: false,
    },
    {
      label: "Позначки",
      values: products.map(
        (p) =>
          getProductBadges(p)
            .map((badge) => badge.label)
            .join(", ") || "—",
      ),
      differs: false,
    },
  ];

  const labels = new Set<string>();
  for (const map of attributesPerProduct) {
    for (const label of map.keys()) {
      labels.add(label);
    }
  }

  const dynamic: CompareRow[] = [...labels]
    .sort((a, b) => a.localeCompare(b, "uk"))
    .map((label) => ({
      label,
      values: attributesPerProduct.map((map) => map.get(label) ?? "—"),
      differs: false,
    }));

  return [...fixed, ...dynamic].map((row) => ({
    ...row,
    differs: new Set(row.values).size > 1,
  }));
}

export default function ComparePage() {
  const { ids, remove, clear, ready } = useCompare();
  const { products, loading } = useProducts();
  const [onlyDifferences, setOnlyDifferences] = useState(false);

  // Keep the order in which the customer picked them.
  const selected = useMemo(
    () =>
      ids
        .map((id) => products.find((product) => product.id === id))
        .filter((product): product is Product => product !== undefined),
    [ids, products],
  );

  const rows = useMemo(() => buildRows(selected), [selected]);
  const visibleRows = onlyDifferences ? rows.filter((row) => row.differs) : rows;

  const empty = ready && !loading && selected.length === 0;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Порівняння товарів"
        subtitle="Характеристики зіставлені по рядках — так простіше побачити різницю."
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
        {!ready || (loading && selected.length === 0) ? (
          <p className="rounded-sm border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">
            Завантаження…
          </p>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center rounded-sm border border-stone-200 bg-white px-6 py-16 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-50 text-stone-400">
              <BarChart3 className="h-8 w-8" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-base font-bold text-stone-800">
              Ви ще нічого не додали до порівняння
            </h2>
            <p className="mt-1 max-w-sm text-sm text-stone-500">
              Натисніть значок порівняння у куті картки товару — обрані позиції
              зʼявляться тут.
            </p>
            <Link
              href="/catalog"
              className="mt-5 rounded-sm bg-accent-500 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-600"
            >
              Перейти до каталогу
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-stone-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent-500"
                  checked={onlyDifferences}
                  onChange={(event) => setOnlyDifferences(event.target.checked)}
                />
                Показати лише відмінності
              </label>
              <button
                type="button"
                onClick={clear}
                className="text-sm font-semibold text-accent-600 transition-colors hover:text-accent-700"
              >
                Очистити порівняння
              </button>
            </div>

            <div className="overflow-x-auto rounded-sm border border-stone-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 z-10 w-40 min-w-40 border-b border-r border-stone-200 bg-white p-3 text-left align-bottom text-xs font-bold uppercase tracking-wide text-stone-500"
                    >
                      Характеристика
                    </th>
                    {selected.map((product) => (
                      <th
                        key={product.id}
                        scope="col"
                        className="min-w-52 border-b border-stone-200 p-3 text-left align-top"
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-sm border border-stone-200 bg-white">
                              <Image
                                src={product.imageUrl}
                                alt={product.name}
                                fill
                                className="object-contain p-1.5"
                                sizes="96px"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => remove(product.id)}
                              aria-label={`Прибрати ${product.name} з порівняння`}
                              title="Прибрати з порівняння"
                              className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                          <Link
                            href={`/product/${product.id}`}
                            className="line-clamp-3 text-sm font-semibold leading-snug text-stone-800 transition-colors hover:text-accent-600"
                          >
                            {product.name}
                          </Link>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr
                      key={row.label}
                      className={row.differs ? "bg-accent-50/40" : undefined}
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-b border-r border-stone-200 bg-white p-3 text-left text-xs font-semibold text-stone-600"
                      >
                        {row.label}
                      </th>
                      {row.values.map((value, index) => (
                        <td
                          key={`${row.label}-${selected[index]?.id ?? index}`}
                          className="border-b border-stone-200 p-3 text-stone-800"
                        >
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {visibleRows.length === 0 ? (
              <p className="mt-4 rounded-sm border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
                За характеристиками ці товари не відрізняються.
              </p>
            ) : null}

            <p className="mt-3 text-xs text-stone-500">
              Рядки з відмінностями підсвічені. «—» означає, що характеристику
              для цього товару не заповнено.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
