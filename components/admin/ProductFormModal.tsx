"use client";

import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  ArrowLeft,
  ArrowRight,
  ImageOff,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { placeholderImage, type ProductInput } from "@/context/ProductsContext";
import {
  MAX_PRODUCT_IMAGES,
  PRODUCT_BADGES,
  categories,
  getProductAttributes,
  getProductImages,
  type Product,
} from "@/lib/products";

/** Kept in step with `maximumSizeInBytes` in /api/admin/upload. */
const MAX_UPLOAD_MB = 10;

/** Blob accepts most characters, but a tidy ASCII-ish name is easier to read. */
function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^\w.\-]/g, "");
  return cleaned || "photo.jpg";
}

/** Turn SDK/network failures into something an admin can act on. */
function uploadErrorMessage(message: string): string {
  if (/unauthorized|401/i.test(message)) {
    return "Сесія завершилася. Увійдіть в адмін-панель ще раз.";
  }
  if (/token/i.test(message)) {
    return (
      "Сховище Vercel Blob не налаштоване: немає змінної BLOB_READ_WRITE_TOKEN. " +
      "Додайте її у Vercel → Storage → Blob і зробіть Redeploy."
    );
  }
  if (/size|large/i.test(message)) {
    return `Файл завеликий. Максимум — ${MAX_UPLOAD_MB} МБ.`;
  }
  return `Не вдалося завантажити файл: ${message}`;
}

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
  barcode: string;
  /** Every photo, in display order. The first one is the main photo. */
  images: string[];
  shortDescription: string;
  attributes: AttributeRow[];
  isPromo: boolean;
  isBestseller: boolean;
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
  barcode: "",
  images: [],
  shortDescription: "",
  attributes: [],
  isPromo: false,
  isBestseller: false,
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
  /** URLs whose <img> failed to load — shown as a broken tile, not a blank one. */
  const [brokenImages, setBrokenImages] = useState<string[]>([]);
  const [urlDraft, setUrlDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  /** Position in a multi-file upload, e.g. "2 / 5". Null while idle. */
  const [uploadQueue, setUploadQueue] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const images = values.images;
  const roomLeft = MAX_PRODUCT_IMAGES - images.length;

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

  /* -------------------------------- photos -------------------------------- */

  /** Append photos, keeping the list free of duplicates and within the cap. */
  function appendImages(urls: string[]) {
    setValues((prev) => {
      const next = [...prev.images];
      for (const raw of urls) {
        const url = raw.trim();
        if (!url || next.includes(url) || next.length >= MAX_PRODUCT_IMAGES) {
          continue;
        }
        next.push(url);
      }
      return next.length === prev.images.length ? prev : { ...prev, images: next };
    });
  }

  function removeImage(url: string) {
    setValues((prev) => ({
      ...prev,
      images: prev.images.filter((item) => item !== url),
    }));
  }

  /** Move a photo one slot left or right; the first slot is the main photo. */
  function moveImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    setValues((prev) => {
      if (index < 0 || target < 0 || target >= prev.images.length) {
        return prev;
      }
      const next = [...prev.images];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, images: next };
    });
  }

  function addImageFromUrl() {
    const url = urlDraft.trim();
    if (!url) {
      return;
    }
    if (images.includes(url)) {
      setUploadError("Це фото вже додане.");
      return;
    }
    if (roomLeft <= 0) {
      setUploadError(`Максимум ${MAX_PRODUCT_IMAGES} фотографій на товар.`);
      return;
    }
    setUploadError(null);
    appendImages([url]);
    setUrlDraft("");
  }

  /**
   * Send the chosen files straight to Vercel Blob and append the resulting
   * public URLs to the gallery. Files do not pass through our server —
   * `/api/admin/upload` only issues a token — so phone-sized photos are fine.
   *
   * Uploaded one at a time on purpose: the progress bar then means something,
   * and a failure on file 3 still keeps files 1 and 2.
   */
  async function handleFilesSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const picked = [...(event.target.files ?? [])];
    // Reset immediately so picking the same files twice fires onChange again.
    event.target.value = "";
    if (picked.length === 0) {
      return;
    }

    setUploadError(null);
    const problems: string[] = [];
    const accepted: File[] = [];

    for (const file of picked) {
      if (!file.type.startsWith("image/")) {
        problems.push(`«${file.name}» — не зображення.`);
      } else if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        problems.push(
          `«${file.name}» — завеликий (${(file.size / 1024 / 1024).toFixed(1)} МБ).`,
        );
      } else {
        accepted.push(file);
      }
    }

    // `roomLeft` is a snapshot from this render, which is exactly right: no
    // other upload can be running while this one holds the input disabled.
    const queue = accepted.slice(0, Math.max(0, roomLeft));
    if (accepted.length > queue.length) {
      problems.push(
        `Взято перші ${queue.length}: максимум ${MAX_PRODUCT_IMAGES} фотографій на товар.`,
      );
    }

    if (queue.length === 0) {
      setUploadError(problems.join(" ") || "Немає файлів для завантаження.");
      return;
    }

    setUploading(true);
    setUploadQueue({ done: 0, total: queue.length });
    setUploadProgress(0);

    const uploaded: string[] = [];
    for (const [index, file] of queue.entries()) {
      setUploadQueue({ done: index, total: queue.length });
      setUploadProgress(0);
      try {
        const result = await upload(
          `products/${safeFileName(file.name)}`,
          file,
          {
            access: "public",
            handleUploadUrl: "/api/admin/upload",
            onUploadProgress: ({ percentage }) => {
              setUploadProgress(Math.round(percentage));
            },
          },
        );
        uploaded.push(result.url);
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : String(caught);
        console.error("[admin/upload] Failed:", caught);
        problems.push(`«${file.name}»: ${uploadErrorMessage(message)}`);
      }
    }

    appendImages(uploaded);
    setUploading(false);
    setUploadQueue(null);
    setUploadProgress(0);
    setUploadError(problems.length > 0 ? problems.join(" ") : null);
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
    // The first photo is the main one; the rest travel as the gallery. With no
    // photos at all we still generate a placeholder, as before.
    const gallery = values.images.map((url) => url.trim()).filter(Boolean);
    const imageUrl = gallery[0] ?? placeholderImage(name);

    const barcode = values.barcode.trim();

    onSubmit({
      name,
      brand,
      categorySlug: values.categorySlug,
      price,
      quantity,
      inStock: quantity > 0,
      barcode: barcode || undefined,
      imageUrl,
      images: gallery.slice(1),
      shortDescription: values.shortDescription.trim(),
      techSpecs: { power: "", weight: "", warranty: "" },
      attributes,
      isPromo: values.isPromo,
      isBestseller: values.isBestseller,
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
              <label htmlFor="pf-barcode" className={labelClass}>
                Артикул
              </label>
              <input
                id="pf-barcode"
                type="text"
                placeholder="напр. F016800340"
                value={values.barcode}
                onChange={(event) => setField("barcode", event.target.value)}
                className={fieldClass}
              />
              <p className="mt-1 text-xs text-stone-500">
                Необов&apos;язково. За ним можна шукати товар у каталозі та
                адмінці.
              </p>
            </div>

            <div className="sm:col-span-2">
              <span className={labelClass}>Позначки</span>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {PRODUCT_BADGES.map((badge) => (
                  <label
                    key={badge.field}
                    className="flex cursor-pointer items-center gap-2 rounded-sm border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-700 transition-colors hover:border-accent-500"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-accent-500"
                      checked={values[badge.field] === true}
                      onChange={(event) =>
                        setField(badge.field, event.target.checked)
                      }
                    />
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Показуються бейджем на картці товару. Синхронізація з УкрСклад їх
                не скидає.
              </p>
            </div>

            {/* ------------------------- Photos -------------------------- */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className={labelClass}>Фотографії товару</span>
                <span className="text-xs font-semibold text-stone-500">
                  {images.length} / {MAX_PRODUCT_IMAGES}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <label
                  htmlFor="pf-file"
                  className={`flex items-center gap-2 rounded-sm border px-4 py-2 text-sm font-bold transition-colors ${
                    uploading || roomLeft <= 0
                      ? "cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400"
                      : "cursor-pointer border-accent-500 bg-accent-50 text-accent-700 hover:bg-accent-100"
                  }`}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden="true" />
                  )}
                  {uploading
                    ? `Завантаження ${(uploadQueue?.done ?? 0) + 1} з ${uploadQueue?.total ?? 1}… ${uploadProgress}%`
                    : "Завантажити з пристрою"}
                </label>
                <input
                  id="pf-file"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading || roomLeft <= 0}
                  onChange={handleFilesSelected}
                  className="sr-only"
                />
                <span className="text-xs text-stone-500">
                  Можна вибрати кілька файлів одразу
                </span>
              </div>

              {uploading ? (
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200"
                  role="progressbar"
                  aria-valuenow={uploadProgress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-accent-500 transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              ) : null}

              {uploadError ? (
                <p className="mt-2 rounded-sm border-l-4 border-red-500 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {uploadError}
                </p>
              ) : null}

              {/* Add by URL */}
              <div className="mt-3 flex items-start gap-2">
                <div className="flex-1">
                  <label htmlFor="pf-image" className="sr-only">
                    URL фотографії
                  </label>
                  <input
                    id="pf-image"
                    type="url"
                    inputMode="url"
                    placeholder="…або вставте URL фотографії"
                    value={urlDraft}
                    onChange={(event) => setUrlDraft(event.target.value)}
                    onKeyDown={(event) => {
                      // Enter here must add a photo, not submit the whole form.
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addImageFromUrl();
                      }
                    }}
                    className={`${fieldClass} mt-0`}
                  />
                </div>
                <button
                  type="button"
                  onClick={addImageFromUrl}
                  disabled={!urlDraft.trim() || roomLeft <= 0}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 transition-colors hover:border-accent-500 hover:text-accent-600 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400 disabled:hover:border-stone-200"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Додати
                </button>
              </div>

              {/* Gallery */}
              {images.length === 0 ? (
                <div className="mt-3 flex h-32 flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-stone-300 text-stone-400">
                  <ImageOff className="h-7 w-7" aria-hidden="true" />
                  <span className="px-4 text-center text-xs">
                    Фотографій немає — буде згенеровано зображення-заповнювач
                  </span>
                </div>
              ) : (
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {images.map((url, index) => (
                    <li
                      key={url}
                      className={`overflow-hidden rounded-sm border ${
                        index === 0 ? "border-accent-500" : "border-stone-200"
                      }`}
                    >
                      <div className="relative flex h-24 items-center justify-center bg-stone-50">
                        {brokenImages.includes(url) ? (
                          <div className="flex flex-col items-center gap-1 px-2 text-center text-stone-400">
                            <ImageOff className="h-5 w-5" aria-hidden="true" />
                            <span className="text-[10px]">Не завантажилось</span>
                          </div>
                        ) : (
                          // Arbitrary user-supplied URLs with graceful error
                          // handling — next/image cannot do the onError fallback.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={`Фото ${index + 1}`}
                            className="h-full w-full object-contain"
                            onError={() =>
                              setBrokenImages((prev) =>
                                prev.includes(url) ? prev : [...prev, url],
                              )
                            }
                          />
                        )}
                        {index === 0 ? (
                          <span className="absolute left-1 top-1 rounded-sm bg-accent-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            Головна
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between border-t border-stone-200 bg-white px-1 py-1">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveImage(index, -1)}
                            disabled={index === 0}
                            aria-label={`Перемістити фото ${index + 1} ліворуч`}
                            className="rounded-sm p-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-transparent"
                          >
                            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveImage(index, 1)}
                            disabled={index === images.length - 1}
                            aria-label={`Перемістити фото ${index + 1} праворуч`}
                            className="rounded-sm p-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-transparent"
                          >
                            <ArrowRight
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeImage(url)}
                          aria-label={`Видалити фото ${index + 1}`}
                          className="rounded-sm p-1 text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-1.5 text-xs text-stone-500">
                JPEG, PNG, WebP, AVIF або GIF, до {MAX_UPLOAD_MB} МБ кожен.
                Перша фотографія — головна: саме вона показується на картці
                товару, решта — у галереї на сторінці товару.
              </p>
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
    barcode: product.barcode ?? "",
    images: getProductImages(product),
    shortDescription: product.shortDescription,
    // Merge legacy techSpecs into the editable list so nothing is lost.
    attributes: getProductAttributes(product).map(([label, value]) =>
      newAttributeRow(label, value),
    ),
    isPromo: product.isPromo === true,
    isBestseller: product.isBestseller === true,
  };
}
