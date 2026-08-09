"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Inbox,
  Loader2,
  LogOut,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import ProductFormModal, {
  EMPTY_PRODUCT_FORM,
  toFormValues,
} from "@/components/admin/ProductFormModal";
import { useProducts } from "@/context/ProductsContext";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  categories,
  productMatchesQuery,
  type Product,
} from "@/lib/products";

/** Rows fetched/rendered per page — the admin list is never unbounded. */
const PAGE_SIZE = 20;

const SECTIONS = [
  { id: "products", label: "Товари", icon: Package },
  { id: "orders", label: "Замовлення", icon: ShoppingCart },
  { id: "settings", label: "Налаштування", icon: Settings },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function categoryName(slug: string): string {
  return categories.find((category) => category.slug === slug)?.name ?? slug;
}

function formatPrice(value: number): string {
  return `${value.toLocaleString("uk-UA")} ₴`;
}

export default function AdminPage() {
  const {
    products,
    source,
    loading,
    refresh,
    updateProduct,
    deleteProduct,
    createProduct,
  } = useProducts();

  const [activeSection, setActiveSection] = useState<SectionId>("products");
  const [query, setQuery] = useState("");

  // Modal state — only one is ever open at a time.
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Run a database write and surface any failure instead of swallowing it. */
  async function runSave(action: () => Promise<void>) {
    setSaveError(null);
    try {
      await action();
      // Reload the current page of results so the table reflects the change.
      setRefreshToken((token) => token + 1);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setSaveError(`Не вдалося зберегти: ${message}`);
      window.setTimeout(() => setSaveError(null), 6000);
    }
  }

  // Typing updates `query` instantly (the input stays responsive); the search
  // itself only runs once typing pauses.
  const debouncedQuery = useDebouncedValue(query, 350);

  const [rows, setRows] = useState<Product[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  /** Size of the whole catalog, captured when no query is active. */
  const [catalogTotal, setCatalogTotal] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [serverSearch, setServerSearch] = useState(true);
  /** Bumped after a save/delete to force the list to reload. */
  const [refreshToken, setRefreshToken] = useState(0);

  // Reset paging whenever the query changes.
  const [syncedQuery, setSyncedQuery] = useState(debouncedQuery);
  if (debouncedQuery !== syncedQuery) {
    setSyncedQuery(debouncedQuery);
    setPageSize(PAGE_SIZE);
  }

  useEffect(() => {
    if (!serverSearch) {
      return;
    }
    const controller = new AbortController();
    // Data fetching is a valid effect; the synchronous progress flag it sets
    // is intentional and drives the spinner in the search field.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(true);

    const params = new URLSearchParams({
      q: debouncedQuery.trim(),
      limit: String(pageSize),
    });

    fetch(`/api/admin/products/search?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 503) {
          // No database (local file source) — fall back to filtering in memory.
          setServerSearch(false);
          return;
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as {
          products: Product[];
          total: number;
        };
        setRows(data.products);
        setTotal(data.total);
        // Only an unfiltered result reflects the size of the whole catalog.
        if (debouncedQuery.trim() === "") {
          setCatalogTotal(data.total);
        }
      })
      .catch((caught: unknown) => {
        if ((caught as Error)?.name === "AbortError") {
          return;
        }
        console.error("[admin] Search failed:", caught);
        setServerSearch(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      });

    return () => controller.abort();
  }, [debouncedQuery, pageSize, serverSearch, refreshToken]);

  /** Client-side fallback used only when the database is unavailable. */
  const clientFiltered = useMemo(() => {
    if (serverSearch) {
      return [];
    }
    const search = debouncedQuery.trim();
    if (!search) {
      return products;
    }
    const lowered = search.toLowerCase();
    return products.filter(
      (product) =>
        productMatchesQuery(product, search) ||
        product.brand.toLowerCase().includes(lowered),
    );
  }, [serverSearch, products, debouncedQuery]);

  const visibleProducts = serverSearch
    ? (rows ?? [])
    : clientFiltered.slice(0, pageSize);
  const matchCount = serverSearch ? (total ?? 0) : clientFiltered.length;
  const hasMore = visibleProducts.length < matchCount;

  const stats = [
    {
      label: "Товарів у каталозі",
      value: String(serverSearch ? (catalogTotal ?? 0) : products.length),
    },
    { label: "Категорій", value: String(categories.length) },
    { label: "Замовлень", value: "0" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-graphite-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Адмін-панель</h1>
            <p className="mt-1 text-sm text-slate-500">
              Керування каталогом, замовленнями та налаштуваннями магазину.
            </p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:border-accent-500 hover:text-accent-600"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Вийти
            </button>
          </form>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[240px_1fr]">
        {/* Sidebar navigation */}
        <aside className="h-fit rounded-xl bg-graphite-950 p-4">
          <nav>
            <ul className="flex flex-row gap-2 lg:flex-col">
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <li key={section.id} className="flex-1">
                    <button
                      type="button"
                      onClick={() => setActiveSection(section.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors lg:justify-start ${
                        isActive
                          ? "bg-accent-500 text-white"
                          : "text-graphite-300 hover:bg-graphite-900 hover:text-white"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="hidden sm:inline">{section.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <main className="min-w-0">
          {activeSection === "products" ? (
            <section>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-graphite-200 bg-white p-5"
                  >
                    <div className="text-2xl font-extrabold text-graphite-950">
                      {stat.value}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-graphite-500">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              <div
                className={`mt-4 flex items-center gap-2 rounded-lg border-l-4 px-4 py-2.5 text-sm ${
                  source === "database" || source === "ukrsklad"
                    ? "border-green-500 bg-green-50 text-green-800"
                    : "border-accent-500 bg-accent-50 text-stone-700"
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    source === "database" || source === "ukrsklad"
                      ? "bg-green-500"
                      : "bg-accent-500"
                  }`}
                  aria-hidden="true"
                />
                {source === "database"
                  ? "Каталог завантажено з бази даних (Neon Postgres)."
                  : source === "ukrsklad"
                    ? "Каталог синхронізовано з файлом обліковою системи УкрСклад."
                    : "Джерело даних недоступне — каталог порожній."}
              </div>

              <div className="mt-4 rounded-xl border border-graphite-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-graphite-100 p-5">
                  <h2 className="text-lg font-bold text-graphite-950">
                    Каталог товарів
                  </h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Search
                        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400"
                        aria-hidden="true"
                      />
                      <label className="sr-only" htmlFor="admin-search">
                        Пошук товарів
                      </label>
                      <input
                        id="admin-search"
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Пошук за назвою, артикулом, штрих-кодом"
                        className="w-64 max-w-full rounded-lg border border-graphite-200 py-2 pl-9 pr-9 text-sm text-graphite-900 focus:border-accent-500 focus:outline-none"
                      />
                      {/* Subtle, non-blocking progress hint inside the field. */}
                      {searching ? (
                        <Loader2
                          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-accent-500"
                          aria-hidden="true"
                        />
                      ) : null}
                      <span className="sr-only" role="status" aria-live="polite">
                        {searching ? "Пошук…" : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refresh()}
                      disabled={loading}
                      title="Оновити дані з УкрСклад"
                      className="flex items-center gap-2 rounded-lg border border-graphite-200 px-3 py-2 text-sm font-semibold text-graphite-600 transition-colors hover:border-accent-500 hover:text-accent-600 disabled:opacity-50"
                    >
                      <RotateCcw
                        className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                        aria-hidden="true"
                      />
                      <span className="hidden sm:inline">Оновити</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreating(true)}
                      className="flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-accent-600"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Додати товар
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-graphite-50 text-left text-xs uppercase tracking-wide text-graphite-500">
                        <th className="px-5 py-3 font-bold">Товар</th>
                        <th className="px-5 py-3 font-bold">Бренд</th>
                        <th className="px-5 py-3 font-bold">Категорія</th>
                        <th className="px-5 py-3 font-bold">Ціна</th>
                        <th className="px-5 py-3 font-bold">Наявність</th>
                        <th className="px-5 py-3 text-right font-bold">Дії</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map((product) => (
                        <tr
                          key={product.id}
                          className="border-t border-graphite-100 transition-colors hover:bg-graphite-50"
                        >
                          <td className="px-5 py-3">
                            <div className="font-semibold text-graphite-950">
                              {product.name}
                            </div>
                            <div className="text-xs text-graphite-500">
                              Артикул: {product.sku ?? product.id}
                              {product.barcode ? (
                                <>
                                  <span className="mx-1.5 text-graphite-300">
                                    |
                                  </span>
                                  Штрих-код: {product.barcode}
                                </>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-graphite-600">
                            {product.brand}
                          </td>
                          <td className="px-5 py-3 text-graphite-600">
                            {categoryName(product.categorySlug)}
                          </td>
                          <td className="px-5 py-3 font-bold text-accent-600">
                            {formatPrice(product.price)}
                          </td>
                          <td className="px-5 py-3">
                            {product.inStock === false ? (
                              <span className="inline-block rounded-full bg-graphite-100 px-2.5 py-1 text-xs font-semibold text-graphite-500">
                                Немає
                              </span>
                            ) : (
                              <span className="inline-block rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                                {typeof product.quantity === "number"
                                  ? `${product.quantity} шт.`
                                  : "В наявності"}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditing(product)}
                                aria-label={`Редагувати ${product.name}`}
                                className="rounded-md border border-graphite-200 p-2 text-graphite-600 transition-colors hover:border-accent-500 hover:text-accent-600"
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleting(product)}
                                aria-label={`Видалити ${product.name}`}
                                className="rounded-md border border-graphite-200 p-2 text-graphite-600 transition-colors hover:border-red-500 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {visibleProducts.length === 0 ? (
                  <p className="p-8 text-center text-sm text-graphite-500">
                    {searching
                      ? "Пошук…"
                      : debouncedQuery.trim()
                        ? `За запитом «${debouncedQuery}» товарів не знайдено.`
                        : "Каталог порожній. Додайте перший товар."}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-graphite-100 p-4">
                    <span className="text-xs text-graphite-500">
                      Показано {visibleProducts.length} з {matchCount}
                    </span>
                    {hasMore ? (
                      <button
                        type="button"
                        onClick={() => setPageSize((size) => size + PAGE_SIZE)}
                        disabled={searching}
                        className="rounded-lg border border-graphite-300 px-4 py-2 text-sm font-bold text-graphite-800 transition-colors hover:border-accent-500 hover:text-accent-600 disabled:opacity-50"
                      >
                        Показати ще
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {activeSection === "orders" ? (
            <section className="rounded-xl border border-graphite-200 bg-white">
              <div className="border-b border-graphite-100 p-5">
                <h2 className="text-lg font-bold text-graphite-950">
                  Замовлення
                </h2>
              </div>
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-graphite-50 text-graphite-400">
                  <Inbox className="h-8 w-8" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-bold text-graphite-950">
                  Замовлення відкриваються окремою сторінкою
                </h3>
                <p className="mt-1 max-w-xs text-sm text-graphite-500">
                  Список читається з бази даних на сервері.
                </p>
                <Link
                  href="/admin/orders"
                  className="mt-4 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-600"
                >
                  Переглянути замовлення
                </Link>
              </div>
            </section>
          ) : null}

          {activeSection === "settings" ? (
            <section className="rounded-xl border border-graphite-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold text-graphite-950">
                Налаштування магазину
              </h2>
              <form
                onSubmit={(event) => event.preventDefault()}
                className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2"
              >
                {[
                  { id: "store-name", label: "Назва магазину", value: "ПанГосподар" },
                  { id: "store-phone", label: "Телефон", value: "+38 (067) 341-37-51" },
                  { id: "store-email", label: "Email", value: "pangospod@gmail.com" },
                  { id: "store-hours", label: "Графік роботи", value: "Пн-Пт 08:30 – 18:00" },
                ].map((field) => (
                  <div key={field.id}>
                    <label
                      htmlFor={field.id}
                      className="text-xs font-semibold uppercase tracking-wide text-graphite-500"
                    >
                      {field.label}
                    </label>
                    <input
                      id={field.id}
                      type="text"
                      defaultValue={field.value}
                      className="mt-1.5 w-full rounded-lg border border-graphite-200 px-3 py-2 text-sm text-graphite-900 focus:border-accent-500 focus:outline-none"
                    />
                  </div>
                ))}

                <div className="sm:col-span-2">
                  <label
                    htmlFor="store-address"
                    className="text-xs font-semibold uppercase tracking-wide text-graphite-500"
                  >
                    Адреса
                  </label>
                  <input
                    id="store-address"
                    type="text"
                    defaultValue="вул. Центральна, 74, смт Ратне, Волинська область, 44100"
                    className="mt-1.5 w-full rounded-lg border border-graphite-200 px-3 py-2 text-sm text-graphite-900 focus:border-accent-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-accent-500 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-600"
                  >
                    Зберегти зміни
                  </button>
                </div>
              </form>
            </section>
          ) : null}
        </main>
      </div>

      {/* Save/delete failures surface here instead of silently doing nothing. */}
      {saveError ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-sm border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-lg">
          {saveError}
        </div>
      ) : null}

      {/* Edit product */}
      {editing ? (
        <ProductFormModal
          title="Редагувати товар"
          submitLabel="Зберегти зміни"
          initialValues={toFormValues(editing)}
          onClose={() => setEditing(null)}
          onSubmit={(draft) => {
            const target = editing;
            setEditing(null);
            void runSave(() => updateProduct({ ...target, ...draft }));
          }}
        />
      ) : null}

      {/* Create product */}
      {creating ? (
        <ProductFormModal
          title="Новий товар"
          submitLabel="Додати товар"
          initialValues={EMPTY_PRODUCT_FORM}
          onClose={() => setCreating(false)}
          onSubmit={(draft) => {
            setCreating(false);
            void runSave(() => createProduct(draft));
          }}
        />
      ) : null}

      {/* Delete confirmation */}
      {deleting ? (
        <ConfirmDialog
          tone="danger"
          title="Видалити товар?"
          message={`Ви впевнені, що хочете видалити цей товар? «${deleting.name}» буде безповоротно вилучено з бази даних.`}
          confirmLabel="Видалити"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const target = deleting;
            setDeleting(null);
            void runSave(() => deleteProduct(target.sku ?? target.id));
          }}
        />
      ) : null}
    </div>
  );
}
