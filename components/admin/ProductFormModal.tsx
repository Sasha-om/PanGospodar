"use client";

import { useEffect, useState } from "react";
import { ImageOff, X } from "lucide-react";
import { placeholderImage, type ProductInput } from "@/context/ProductsContext";
import { categories } from "@/lib/products";

export interface ProductFormValues {
  name: string;
  brand: string;
  categorySlug: string;
  price: string;
  warranty: string;
  power: string;
  weight: string;
  imageUrl: string;
  shortDescription: string;
}

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: "",
  brand: "",
  categorySlug: categories[0]?.slug ?? "",
  price: "",
  warranty: "24 місяці",
  power: "",
  weight: "",
  imageUrl: "",
  shortDescription: "",
};

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-graphite-200 px-3 py-2 text-sm text-graphite-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30";
const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-graphite-500";

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

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const name = values.name.trim();
    const brand = values.brand.trim();
    const price = Number(values.price);

    if (!name) {
      setError("Вкажіть назву товару.");
      return;
    }
    if (!brand) {
      setError("Вкажіть бренд товару.");
      return;
    }
    if (!values.price.trim() || Number.isNaN(price) || price < 0) {
      setError("Вкажіть коректну ціну (число не менше 0).");
      return;
    }

    const imageUrl = values.imageUrl.trim() || placeholderImage(name);

    onSubmit({
      name,
      brand,
      categorySlug: values.categorySlug,
      price,
      imageUrl,
      shortDescription: values.shortDescription.trim(),
      techSpecs: {
        power: values.power.trim(),
        weight: values.weight.trim(),
        warranty: values.warranty.trim(),
      },
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-950/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-graphite-100 px-6 py-4">
          <h2
            id="product-modal-title"
            className="text-lg font-bold text-graphite-950"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="rounded-md p-1.5 text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
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
              <label htmlFor="pf-warranty" className={labelClass}>
                Гарантія
              </label>
              <input
                id="pf-warranty"
                type="text"
                value={values.warranty}
                onChange={(event) => setField("warranty", event.target.value)}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="pf-power" className={labelClass}>
                Потужність
              </label>
              <input
                id="pf-power"
                type="text"
                placeholder="напр. 1.5 кВт"
                value={values.power}
                onChange={(event) => setField("power", event.target.value)}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="pf-weight" className={labelClass}>
                Вага
              </label>
              <input
                id="pf-weight"
                type="text"
                placeholder="напр. 4.5 кг"
                value={values.weight}
                onChange={(event) => setField("weight", event.target.value)}
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
              <p className="mt-1 text-xs text-graphite-500">
                Залиште порожнім, щоб згенерувати зображення-заповнювач.
              </p>
            </div>

            <div className="sm:col-span-2">
              <span className={labelClass}>Попередній перегляд</span>
              <div className="mt-1.5 flex h-48 items-center justify-center overflow-hidden rounded-lg border border-graphite-200 bg-graphite-50">
                {values.imageUrl.trim() && !imageError ? (
                  // Arbitrary user-supplied URLs with graceful error handling —
                  // a plain <img> is intentional here (next/image is unnecessary
                  // for a live form preview).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={values.imageUrl.trim()}
                    alt="Попередній перегляд фотографії товару"
                    className="h-full w-full object-contain"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 px-4 text-center text-graphite-400">
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
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-graphite-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-graphite-200 px-4 py-2 text-sm font-bold text-graphite-700 transition-colors hover:bg-graphite-50"
          >
            Скасувати
          </button>
          <button
            type="submit"
            className="rounded-lg bg-accent-500 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-accent-600"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Build editable form values from an existing product's fields. */
export function toFormValues(product: {
  name: string;
  brand: string;
  categorySlug: string;
  price: number;
  imageUrl: string;
  shortDescription: string;
  techSpecs: { power: string; weight: string; warranty: string };
}): ProductFormValues {
  return {
    name: product.name,
    brand: product.brand,
    categorySlug: product.categorySlug,
    price: String(product.price),
    warranty: product.techSpecs.warranty,
    power: product.techSpecs.power,
    weight: product.techSpecs.weight,
    imageUrl: product.imageUrl,
    shortDescription: product.shortDescription,
  };
}
