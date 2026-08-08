"use client";

import { useEffect, useState } from "react";
import { ImageOff, Plus, Trash2, X } from "lucide-react";
import { placeholderImage, type ProductInput } from "@/context/ProductsContext";
import { categories, getProductAttributes, type Product } from "@/lib/products";

/** One editable characteristic row. `id` keeps React keys stable while typing. */
export interface AttributeRow {
  id: string;
  label: string;
  value: string;
}

export interface ProductFormValues {
  name: string;
  brand: string;
  categorySlug: string;
  price: string;
  stock: string;
  imageUrl: string;
  shortDescription: string;
  attributes: AttributeRow[];
}

let attributeIdCounter = 0;
function newAttributeRow(label = "", value = ""): AttributeRow {
  attributeIdCounter += 1;
  return { id: `attr-${attributeIdCounter}`, label, value };
}

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: "",
  brand: "",
  categorySlug: categories[0]?.slug ?? "",
  price: "",
  stock: "0",
  imageUrl: "",
  shortDescription: "",
  attributes: [],
};

const fieldClass =
  "mt-1.5 w-full rounded-sm border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30";
const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-stone-500";

export default function ProductFormModal({
  title,
  submitLabel,
  initialValues,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  initialValues: ProductFormValues;
  /** Receives a validated product (the id is assigned by the store). */
  onSubmit: (input: ProductInput) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  function setField<K extends keyof ProductFormValues>(
    key: K,
    value: ProductFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /* ----------------------------- attributes ----------------------------- */

  function addAttribute() {
    setValues((prev) => ({
      ...prev,
      attributes: [...prev.attributes, newAttributeRow()],
    }));
  }

  function updateAttribute(id: string, patch: Partial<AttributeRow>) {
    setValues((prev) => ({
      ...prev,
      attributes: prev.attributes.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }));
  }

  function removeAttribute(id: string) {
    setValues((prev) => ({
      ...prev,
      attributes: prev.attributes.filter((row) => row.id !== id),
    }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const name = values.name.trim();
    const brand = values.brand.trim();
    const price = Number(values.price);

    if (!name) {
      setError("Вкажіть назву товару.");
      return;
    }
    if (!values.price.trim() || Number.isNaN(price) || price < 0) {
      setError("Вкажіть коректну ціну (число не менше 0).");
      return;
    }

    // Reject duplicate characteristic labels — they would silently overwrite.
    const labels = values.attributes
      .map((row) => row.label.trim().toLowerCase())
      .filter(Boolean);
    if (new Set(labels).size !== labels.length) {
      setError("Назви характеристик повторюються — зробіть їх унікальними.");
      return;
    }

    const attributes: Record<string, string> = {};
    for (const row of values.attributes) {
      const label = row.label.trim();
      const value = row.value.trim();
      if (label && value) {
        attributes[label] = value;
      }
    }

    const quantity = Math.max(0, Math.round(Number(values.stock) || 0));
    const imageUrl = values.imageUrl.trim() || placeholderImage(name);

    onSubmit({
      name,
      brand,
      categorySlug: values.categorySlug,
      price,
      quantity,
      inStock: quantity > 0,
      imageUrl,
      shortDescription: values.shortDescription.trim(),
      techSpecs: { power: "", weight: "", warranty: "" },
      attributes,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-sm bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <h2
            id="product-modal-title"
            className="text-lg font-bold text-stone-800"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="rounded-sm p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="pf-name" className={labelClass}>
                Назва
              </label>
              <input
                id="pf-name"
                type="text"
                autoFocus
                value={values.name}
                onChange={(event) => setField("name", event.target.value)}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="pf-brand" className={labelClass}>
                Бренд
              </label>
              <input
                id="pf-brand"
                type="text"
                value={values.brand}
                onChange={(event) => setField("brand", event.target.value)}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="pf-category" className={labelClass}>
                Категорія
              </label>
              <select
                id="pf-category"
                value={values.categorySlug}
                onChange={(event) =>
                  setField("categorySlug", event.target.value)
                }
                className={fieldClass}
              >
                {categories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pf-price" className={labelClass}>
                Ціна, ₴
              </label>
              <input
                id="pf-price"
                type="number"
                min={0}
                inputMode="numeric"
                value={values.price}
                onChange={(event) => setField("price", event.target.value)}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="pf-stock" className={labelClass}>
                Залишок, шт.
              </label>
              <input
                id="pf-stock"
                type="number"
                min={0}
                inputMode="numeric"
                value={values.stock}
                onChange={(event) => setField("stock", event.target.value)}
                className={fieldClass}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="pf-image" className={labelClass}>
                URL фотографії
              </label>
              <input
                id="pf-image"
                type="url"
                inputMode="url"
                placeholder="https://example.com/photo.jpg"
                value={values.imageUrl}
                onChange={(event) => {
                  setField("imageUrl", event.target.value);
                  setImageError(false);
                }}
                className={fieldClass}
              />
              <p className="mt-1 text-xs text-stone-500">
                Залиште порожнім, щоб згенерувати зображення-заповнювач.
              </p>
            </div>

            <div className="sm:col-span-2">
              <span className={labelClass}>Попередній перегляд</span>
              <div className="mt-1.5 flex h-40 items-center justify-center overflow-hidden rounded-sm border border-stone-200 bg-stone-50">
                {values.imageUrl.trim() && !imageError ? (
                  // Arbitrary user-supplied URLs with graceful error handling.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={values.imageUrl.trim()}
                    alt="Попередній перегляд фотографії товару"
                    className="h-full w-full object-contain"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 px-4 text-center text-stone-400">
                    <ImageOff className="h-8 w-8" aria-hidden="true" />
                    <span className="text-xs">
                      {imageError
                        ? "Не вдалося завантажити зображення за цим URL"
                        : "Зображення з'явиться тут"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ---------------------- Characteristics ---------------------- */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className={labelClass}>Характеристики</span>
                <button
                  type="button"
                  onClick={addAttribute}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-stone-300 px-2.5 py-1 text-xs font-bold text-stone-700 transition-colors hover:border-accent-500 hover:text-accent-600"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Додати характеристику
                </button>
              </div>

              {values.attributes.length === 0 ? (
                <p className="mt-2 rounded-sm border border-dashed border-stone-300 px-3 py-4 text-center text-xs text-stone-500">
                  Характеристик немає. Додайте, наприклад «Потужність» → «1.5 кВт».
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {values.attributes.map((row, index) => (
                    <li key={row.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        aria-label={`Назва характеристики ${index + 1}`}
                        placeholder="Назва (напр. Потужність)"
                        value={row.label}
                        onChange={(event) =>
                          updateAttribute(row.id, { label: event.target.value })
                        }
                        className="w-2/5 rounded-sm border border-stone-200 px-2.5 py-1.5 text-sm text-stone-800 focus:border-accent-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        aria-label={`Значення характеристики ${index + 1}`}
                        placeholder="Значення (напр. 1.5 кВт)"
                        value={row.value}
                        onChange={(event) =>
                          updateAttribute(row.id, { value: event.target.value })
                        }
                        className="flex-1 rounded-sm border border-stone-200 px-2.5 py-1.5 text-sm text-stone-800 focus:border-accent-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeAttribute(row.id)}
                        aria-label={`Видалити характеристику ${index + 1}`}
                        className="shrink-0 rounded-sm border border-stone-200 p-2 text-stone-500 transition-colors hover:border-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1.5 text-xs text-stone-500">
                Ці характеристики стають фільтрами в каталозі.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="pf-description" className={labelClass}>
                Опис
              </label>
              <textarea
                id="pf-description"
                rows={3}
                value={values.shortDescription}
                onChange={(event) =>
                  setField("shortDescription", event.target.value)
                }
                className={`${fieldClass} resize-y`}
              />
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-stone-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-stone-200 px-4 py-2 text-sm font-bold text-stone-700 transition-colors hover:bg-stone-50"
          >
            Скасувати
          </button>
          <button
            type="submit"
            className="rounded-sm bg-accent-500 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-accent-600"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Build editable form values from an existing product. */
export function toFormValues(product: Product): ProductFormValues {
  return {
    name: product.name,
    brand: product.brand,
    categorySlug: product.categorySlug,
    price: String(product.price),
    stock: String(product.quantity ?? 0),
    imageUrl: product.imageUrl,
    shortDescription: product.shortDescription,
    // Merge legacy techSpecs into the editable list so nothing is lost.
    attributes: getProductAttributes(product).map(([label, value]) =>
      newAttributeRow(label, value),
    ),
  };
}
