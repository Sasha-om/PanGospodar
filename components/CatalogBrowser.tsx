"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { useProducts } from "@/context/ProductsContext";
import {
  PRODUCT_BADGES,
  categories,
  getProductAttributes,
  getSubcategoryBySlug,
  productMatchesQuery,
  type Product,
} from "@/lib/products";

const SORT_OPTIONS = [
  { value: "default", label: "За замовчуванням" },
  { value: "promo-first", label: "Спочатку акційні" },
  { value: "bestseller-first", label: "Спочатку топ продажів" },
  { value: "price-asc", label: "Від дешевих до дорогих" },
  { value: "price-desc", label: "Від дорогих до дешевих" },
  { value: "name-asc", label: "За назвою: А – Я" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

type FilterOption = { value: string; label: string };

const PAGE_SIZE = 24;

/**
 * Availability, straight from the accounting system's stock figure: a positive
 * quantity is in stock, zero is not. Both loaders normalise a missing figure to
 * zero, so "no data" reads as out of stock rather than silently in stock.
 */
function isInStock(product: Product): boolean {
  return typeof product.quantity === "number"
    ? product.quantity > 0
    : product.inStock === true;
}

/**
 * Fixed, unlike the brand and characteristic groups: both boxes are always
 * offered so the block does not appear and disappear as the customer narrows
 * the category. Ticking both is the same as ticking neither.
 */
const AVAILABILITY_OPTIONS: FilterOption[] = [
  { value: "in", label: "В наявності" },
  { value: "out", label: "Немає в наявності" },
];

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "uk"));
}

function toOptions(values: string[]): FilterOption[] {
  return uniqueSorted(values).map((value) => ({ value, label: value }));
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

function FilterGroup({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) {
    return null;
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-bold text-stone-800">
        {legend}
      </legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-2 text-sm text-stone-700 transition-colors hover:text-stone-800"
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent-500"
            checked={selected.includes(option.value)}
            onChange={() => onToggle(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

export default function CatalogBrowser({
  categorySlug,
  showCategoryFilter = false,
}: {
  /** Scope the live catalog to a single category (e.g. on a category page). */
  categorySlug?: string;
  showCategoryFilter?: boolean;
}) {
  const { products: storeProducts, loading } = useProducts();
  const searchParams = useSearchParams();

  const categoryParam = searchParams.get("category");
  const subParam = searchParams.get("sub");
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();

  const subcategory = subParam ? getSubcategoryBySlug(subParam) : undefined;
  const subRegex = useMemo(
    () => (subcategory ? new RegExp(subcategory.pattern, "i") : null),
    [subcategory],
  );

  const products = useMemo(
    () =>
      categorySlug
        ? storeProducts.filter((product) => product.categorySlug === categorySlug)
        : storeProducts,
    [storeProducts, categorySlug],
  );

  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    categoryParam ? [categoryParam] : [],
  );

  // Keep the category checkboxes in sync when the mega-menu navigates within
  // /catalog (same route — the component is not remounted).
  const [syncedCategoryParam, setSyncedCategoryParam] = useState(categoryParam);
  if (categoryParam !== syncedCategoryParam) {
    setSyncedCategoryParam(categoryParam);
    setSelectedCategories(categoryParam ? [categoryParam] : []);
  }
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  /** Badge `field` names ("isPromo", "isBestseller") the customer ticked. */
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  /** "in" / "out" — empty means no availability constraint. */
  const [selectedAvailability, setSelectedAvailability] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<SortValue>("default");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  /**
   * Products in the current *scope*: category (from the URL or the page prop),
   * subcategory and search query — but NOT the sidebar selections. Filter
   * options are derived from this, so the sidebar only ever offers values that
   * exist in the category the customer is looking at, and it recomputes as
   * soon as the category changes.
   */
  const scopedProducts = useMemo(() => {
    return products.filter((product) => {
      if (categoryParam && product.categorySlug !== categoryParam) {
        return false;
      }
      if (subRegex && !subRegex.test(product.name)) {
        return false;
      }
      // Matches name, description, article and barcode.
      if (query && !productMatchesQuery(product, query)) {
        return false;
      }
      return true;
    });
  }, [products, categoryParam, subRegex, query]);

  const categoryOptions = useMemo<FilterOption[]>(() => {
    if (!showCategoryFilter) {
      return [];
    }
    // The category list itself must not collapse to the selected category,
    // so it is built from everything the search/subcategory scope allows.
    const present = new Set(products.map((product) => product.categorySlug));
    return categories
      .filter((category) => present.has(category.slug))
      .map((category) => ({ value: category.slug, label: category.name }));
  }, [products, showCategoryFilter]);

  const brandOptions = useMemo(
    () =>
      toOptions(scopedProducts.map((product) => product.brand).filter(Boolean)),
    [scopedProducts],
  );

  // Only offer a badge that some product in scope actually carries, so the
  // filter never leads to a guaranteed-empty result.
  const badgeOptions = useMemo<FilterOption[]>(
    () =>
      PRODUCT_BADGES.filter((badge) =>
        scopedProducts.some((product) => product[badge.field] === true),
      ).map((badge) => ({ value: badge.field, label: badge.label })),
    [scopedProducts],
  );

  /**
   * Attribute filter groups, built from the characteristics that actually occur
   * in the scoped products. Nothing is hardcoded — a new characteristic added
   * in the admin panel becomes a filter automatically.
   */
  const attributeGroups = useMemo(() => {
    // `count` is how many products in scope carry the characteristic at all —
    // `getProductAttributes` returns one entry per label, so a product can
    // only increment it once.
    const byLabel = new Map<string, { values: Set<string>; count: number }>();
    for (const product of scopedProducts) {
      for (const [label, value] of getProductAttributes(product)) {
        const bucket = byLabel.get(label) ?? { values: new Set<string>(), count: 0 };
        bucket.values.add(value);
        bucket.count += 1;
        byLabel.set(label, bucket);
      }
    }
    const total = scopedProducts.length;
    return (
      [...byLabel.entries()]
        /**
         * Hide only a characteristic that genuinely cannot narrow anything:
         * every product in scope has it *and* they all share one value.
         *
         * The previous rule dropped any characteristic with a single distinct
         * value, which is the shape every characteristic has when it has just
         * been filled in on one product — so a newly added characteristic was
         * invisible in the catalogue until a second product got a different
         * value for it. A characteristic on a handful of products is exactly
         * what a shopper wants to filter by.
         */
        .filter(
          ([, { values, count }]) => !(values.size === 1 && count === total),
        )
        .sort(([a], [b]) => a.localeCompare(b, "uk"))
        .map(([label, { values }]) => ({
          label,
          options: toOptions([...values]),
        }))
    );
  }, [scopedProducts]);

  // Selected attribute values, keyed by characteristic label.
  const [selectedAttributes, setSelectedAttributes] = useState<
    Record<string, string[]>
  >({});

  function toggleAttribute(label: string, value: string) {
    setSelectedAttributes((prev) => {
      const next = toggleValue(prev[label] ?? [], value);
      if (next.length === 0) {
        const rest = { ...prev };
        delete rest[label];
        return rest;
      }
      return { ...prev, [label]: next };
    });
  }

  const visibleProducts = useMemo(() => {
    const min = minPrice.trim() ? Number(minPrice) : null;
    const max = maxPrice.trim() ? Number(maxPrice) : null;

    const filtered = scopedProducts.filter((product) => {
      if (
        selectedCategories.length &&
        !selectedCategories.includes(product.categorySlug)
      ) {
        return false;
      }
      if (selectedBrands.length && !selectedBrands.includes(product.brand)) {
        return false;
      }
      // Combines with every other filter rather than replacing them; ticking
      // both boxes matches both keys, which is the same as ticking neither.
      if (
        selectedAvailability.length &&
        !selectedAvailability.includes(isInStock(product) ? "in" : "out")
      ) {
        return false;
      }
      // Ticking both means "акційні АБО топ продажів", which is what a shopper
      // scanning for deals expects — not the empty intersection of the two.
      if (
        selectedBadges.length &&
        !selectedBadges.some((field) => product[field as "isPromo"] === true)
      ) {
        return false;
      }
      if (min !== null && !Number.isNaN(min) && product.price < min) {
        return false;
      }
      if (max !== null && !Number.isNaN(max) && product.price > max) {
        return false;
      }
      const attributeEntries = Object.entries(selectedAttributes);
      if (attributeEntries.length > 0) {
        const own = new Map(getProductAttributes(product));
        for (const [label, values] of attributeEntries) {
          const current = own.get(label);
          if (!current || !values.includes(current)) {
            return false;
          }
        }
      }
      return true;
    });

    /** The customer's chosen order — applied only within an availability group. */
    const secondary = (a: Product, b: Product): number => {
      switch (sort) {
        case "promo-first":
          return Number(b.isPromo === true) - Number(a.isPromo === true);
        case "bestseller-first":
          return (
            Number(b.isBestseller === true) - Number(a.isBestseller === true)
          );
        case "price-asc":
          return a.price - b.price;
        case "price-desc":
          return b.price - a.price;
        case "name-asc":
          return a.name.localeCompare(b.name, "uk");
        default:
          return 0;
      }
    };

    /**
     * Availability is the primary key for *every* sort mode, so something the
     * shop cannot ship never outranks something it can — a cheap out-of-stock
     * item stays below the available ones under "від дешевих до дорогих".
     *
     * `Array.prototype.sort` is stable, so "За замовчуванням" (secondary
     * returns 0) keeps the catalogue's own order inside each group.
     */
    return [...filtered].sort(
      (a, b) => Number(isInStock(b)) - Number(isInStock(a)) || secondary(a, b),
    );
  }, [
    scopedProducts,
    selectedCategories,
    selectedBrands,
    selectedBadges,
    selectedAvailability,
    selectedAttributes,
    minPrice,
    maxPrice,
    sort,
  ]);

  const activeFilterCount =
    selectedCategories.length +
    selectedBrands.length +
    selectedBadges.length +
    selectedAvailability.length +
    Object.values(selectedAttributes).reduce(
      (sum, values) => sum + values.length,
      0,
    ) +
    (minPrice.trim() ? 1 : 0) +
    (maxPrice.trim() ? 1 : 0);

  function resetFilters() {
    setSelectedCategories([]);
    setSelectedBrands([]);
    setSelectedBadges([]);
    setSelectedAvailability([]);
    setSelectedAttributes({});
    setMinPrice("");
    setMaxPrice("");
  }

  /** Current /catalog URL with one query param removed. */
  function hrefWithout(param: "sub" | "q"): string {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(param);
    const queryString = params.toString();
    return `/catalog${queryString ? `?${queryString}` : ""}`;
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[250px_1fr]">
      {/* Mobile filter toggle */}
      <button
        type="button"
        onClick={() => setFiltersOpen((open) => !open)}
        aria-expanded={filtersOpen}
        className="flex items-center justify-center gap-2 rounded-sm border border-stone-200 px-4 py-2.5 text-sm font-bold text-stone-800 transition-colors hover:border-accent-500 hover:text-accent-600 lg:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Фільтри
        {activeFilterCount > 0 ? (
          <span className="rounded-full bg-accent-500 px-2 py-0.5 text-xs text-white">
            {activeFilterCount}
          </span>
        ) : null}
      </button>

      <aside
        className={`${
          filtersOpen ? "flex" : "hidden"
        } h-fit flex-col gap-5 rounded-sm border border-stone-200 bg-white p-4 lg:flex`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-800">
            Фільтри
          </h2>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-accent-600 transition-colors hover:text-accent-700"
            >
              Скинути
            </button>
          ) : null}
        </div>

        <FilterGroup
          legend="Категорія"
          options={categoryOptions}
          selected={selectedCategories}
          onToggle={(value) =>
            setSelectedCategories((prev) => toggleValue(prev, value))
          }
        />

        <FilterGroup
          legend="Наявність"
          options={AVAILABILITY_OPTIONS}
          selected={selectedAvailability}
          onToggle={(value) =>
            setSelectedAvailability((prev) => toggleValue(prev, value))
          }
        />

        <FilterGroup
          legend="Позначки"
          options={badgeOptions}
          selected={selectedBadges}
          onToggle={(value) =>
            setSelectedBadges((prev) => toggleValue(prev, value))
          }
        />

        <FilterGroup
          legend="Бренд"
          options={brandOptions}
          selected={selectedBrands}
          onToggle={(value) =>
            setSelectedBrands((prev) => toggleValue(prev, value))
          }
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold text-stone-800">
            Ціна, ₴
          </legend>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="price-min">
              Ціна від
            </label>
            <input
              id="price-min"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Від"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              className="w-full rounded-sm border border-stone-200 px-2 py-1.5 text-sm text-stone-800 focus:border-accent-500 focus:outline-none"
            />
            <span className="text-stone-400">–</span>
            <label className="sr-only" htmlFor="price-max">
              Ціна до
            </label>
            <input
              id="price-max"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="До"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              className="w-full rounded-sm border border-stone-200 px-2 py-1.5 text-sm text-stone-800 focus:border-accent-500 focus:outline-none"
            />
          </div>
        </fieldset>

        {/* Characteristic filters, generated from the products in scope. */}
        {attributeGroups.map((group) => (
          <FilterGroup
            key={group.label}
            legend={group.label}
            options={group.options}
            selected={selectedAttributes[group.label] ?? []}
            onToggle={(value) => toggleAttribute(group.label, value)}
          />
        ))}
      </aside>

      <div>
        {/* Active URL filters (subcategory from the mega-menu, search query) */}
        {subcategory || query ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {subcategory ? (
              <Link
                href={hrefWithout("sub")}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-accent-600"
              >
                {subcategory.name}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Прибрати фільтр підкатегорії</span>
              </Link>
            ) : null}
            {query ? (
              <Link
                href={hrefWithout("q")}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition-colors hover:border-accent-500 hover:text-accent-600"
              >
                Пошук: «{searchParams.get("q")}»
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Очистити пошук</span>
              </Link>
            ) : null}
          </div>
        ) : null}

        {/* Sort bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4">
          <span className="text-sm text-stone-500">
            Знайдено{" "}
            <span className="font-bold text-stone-800">
              {visibleProducts.length}
            </span>{" "}
            товарів
          </span>

          <div className="flex items-center gap-2">
            <label
              htmlFor="sort"
              className="text-sm font-semibold text-stone-700"
            >
              Сортувати:
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortValue)}
              className="rounded-sm border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors focus:border-accent-500 focus:outline-none"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {visibleProducts.length === 0 && loading ? (
          <div className="rounded-sm border border-stone-200 bg-white p-10 text-center text-stone-500">
            Завантаження товарів...
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="rounded-sm border border-stone-200 bg-white p-10 text-center text-stone-600">
            {activeFilterCount > 0
              ? "За обраними фільтрами товарів не знайдено."
              : "У цій категорії поки немає товарів."}
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-3 block w-full text-sm font-semibold text-accent-600 transition-colors hover:text-accent-700"
              >
                Скинути фільтри
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {visibleProducts.slice(0, limit).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {visibleProducts.length > limit ? (
              <div className="mt-8 flex flex-col items-center gap-2">
                <p className="text-sm text-stone-500">
                  Показано {limit} з {visibleProducts.length}
                </p>
                <button
                  type="button"
                  onClick={() => setLimit((current) => current + PAGE_SIZE)}
                  className="rounded-sm border border-stone-300 px-6 py-3 text-sm font-bold text-stone-800 transition-colors hover:border-accent-500 hover:text-accent-600"
                >
                  Показати ще
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
