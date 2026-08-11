"use client";

import { useState } from "react";
import { ChevronDown, FilterX } from "lucide-react";
import { categories } from "@/lib/products";
import type { AdminFacets } from "@/lib/db";

/**
 * Catalog filters for the admin product list.
 *
 * The list is paged in Postgres (20 rows at a time), so these are *query
 * parameters*, not a client-side filter over the loaded rows — filtering in the
 * browser would only ever narrow the visible page.
 */

export interface AdminFilterState {
  brands: string[];
  categories: string[];
  availability: "in" | "out" | null;
  badges: string[];
  missing: string[];
}

export const EMPTY_FILTERS: AdminFilterState = {
  brands: [],
  categories: [],
  availability: null,
  badges: [],
  missing: [],
};

export function countActiveFilters(filters: AdminFilterState): number {
  return (
    filters.brands.length +
    filters.categories.length +
    filters.badges.length +
    filters.missing.length +
    (filters.availability ? 1 : 0)
  );
}

/** Turn the state into the repeated query params the search route expects. */
export function filtersToParams(
  filters: AdminFilterState,
  params: URLSearchParams,
): void {
  for (const brand of filters.brands) params.append("brand", brand);
  for (const slug of filters.categories) params.append("category", slug);
  for (const badge of filters.badges) params.append("badge", badge);
  for (const key of filters.missing) params.append("missing", key);
  if (filters.availability) params.set("availability", filters.availability);
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

function Row({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-graphite-700 transition-colors hover:text-graphite-950">
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-accent-500"
        checked={checked}
        onChange={onChange}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" ? (
        <span className="shrink-0 text-xs text-graphite-400">{count}</span>
      ) : null}
    </label>
  );
}

/** Collapsible so a 30-brand list does not bury the groups below it. */
function Group({
  legend,
  children,
  defaultOpen = true,
  scroll = false,
}: {
  legend: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  scroll?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-graphite-100 pt-3 first:border-0 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mb-1 flex w-full items-center justify-between text-sm font-bold text-graphite-950"
      >
        {legend}
        <ChevronDown
          className={`h-4 w-4 text-graphite-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div
          className={`flex flex-col ${scroll ? "max-h-56 overflow-y-auto pr-1" : ""}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export default function ProductFilters({
  filters,
  facets,
  onChange,
  onReset,
}: {
  filters: AdminFilterState;
  /** `null` until the counts have loaded, or when there is no database. */
  facets: AdminFacets | null;
  onChange: (next: AdminFilterState) => void;
  onReset: () => void;
}) {
  const active = countActiveFilters(filters);
  const categoryName = (slug: string) =>
    categories.find((category) => category.slug === slug)?.name ?? slug;

  return (
    <div className="rounded-xl border border-graphite-200 bg-white p-4">
      <div className="flex items-center justify-between pb-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-graphite-950">
          Фільтри
        </h3>
        {active > 0 ? (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 text-xs font-semibold text-accent-600 transition-colors hover:text-accent-700"
          >
            <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
            Скинути ({active})
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <Group legend="Наявність">
          <Row
            label="В наявності"
            count={facets?.availability.in}
            checked={filters.availability === "in"}
            onChange={() =>
              onChange({
                ...filters,
                availability: filters.availability === "in" ? null : "in",
              })
            }
          />
          <Row
            label="Немає в наявності"
            count={facets?.availability.out}
            checked={filters.availability === "out"}
            onChange={() =>
              onChange({
                ...filters,
                availability: filters.availability === "out" ? null : "out",
              })
            }
          />
        </Group>

        {/* The reason this panel exists: finding the rows still to fill in. */}
        <Group legend="Потребує заповнення">
          <Row
            label="Без опису"
            count={facets?.missing.description}
            checked={filters.missing.includes("description")}
            onChange={() =>
              onChange({ ...filters, missing: toggle(filters.missing, "description") })
            }
          />
          <Row
            label="Без характеристик"
            count={facets?.missing.attributes}
            checked={filters.missing.includes("attributes")}
            onChange={() =>
              onChange({ ...filters, missing: toggle(filters.missing, "attributes") })
            }
          />
          <Row
            label="Без фото"
            count={facets?.missing.image}
            checked={filters.missing.includes("image")}
            onChange={() =>
              onChange({ ...filters, missing: toggle(filters.missing, "image") })
            }
          />
        </Group>

        <Group legend="Категорія">
          {(facets?.categories ?? []).map((facet) => (
            <Row
              key={facet.value}
              label={categoryName(facet.value)}
              count={facet.count}
              checked={filters.categories.includes(facet.value)}
              onChange={() =>
                onChange({
                  ...filters,
                  categories: toggle(filters.categories, facet.value),
                })
              }
            />
          ))}
        </Group>

        <Group legend="Позначки">
          <Row
            label="Акція"
            checked={filters.badges.includes("promo")}
            onChange={() =>
              onChange({ ...filters, badges: toggle(filters.badges, "promo") })
            }
          />
          <Row
            label="Топ продажів"
            checked={filters.badges.includes("bestseller")}
            onChange={() =>
              onChange({
                ...filters,
                badges: toggle(filters.badges, "bestseller"),
              })
            }
          />
        </Group>

        <Group legend="Бренд" scroll>
          {(facets?.brands ?? []).map((facet) => (
            <Row
              key={facet.value}
              label={facet.value}
              count={facet.count}
              checked={filters.brands.includes(facet.value)}
              onChange={() =>
                onChange({ ...filters, brands: toggle(filters.brands, facet.value) })
              }
            />
          ))}
          {facets && facets.brands.length === 0 ? (
            <p className="text-xs text-graphite-400">Брендів не знайдено.</p>
          ) : null}
        </Group>
      </div>
    </div>
  );
}
