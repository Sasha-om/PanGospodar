export interface ProductTechSpecs {
  power: string;
  weight: string;
  warranty: string;
}

export interface Category {
  slug: string;
  name: string;
  description: string;
  imageUrl: string;
}

export interface Subcategory {
  slug: string;
  name: string;
  categorySlug: string;
  /** Case-insensitive regex source matched against the product name. */
  pattern: string;
}

export interface Product {
  id: string;
  /** Article / code from the accounting system (УкрСклад). Defaults to `id`. */
  sku?: string;
  /** Manufacturer barcode (EAN). Absent for many products. */
  barcode?: string;
  name: string;
  brand: string;
  price: number;
  /** Stock quantity from the accounting system, when available. */
  quantity?: number;
  /** Whether the item is in stock (derived from `quantity > 0`). */
  inStock?: boolean;
  /**
   * Average customer rating (1–5). Only set for products that genuinely have
   * reviews — the card hides the star block when this is absent.
   */
  rating?: number;
  /** Number of reviews behind `rating`. */
  reviewCount?: number;
  shortDescription: string;
  techSpecs: ProductTechSpecs;
  /**
   * Arbitrary product characteristics, editable in the admin panel and stored
   * in the `products.attributes` JSONB column. Keys are the labels shown to
   * customers ("Потужність"), values are free text ("1.5 кВт"). These feed the
   * dynamic catalog filters.
   */
  attributes?: Record<string, string>;
  /** Main photo — used by cards, cart, search results and social previews. */
  imageUrl: string;
  /**
   * Extra photos, in display order, shown in the gallery on the product page.
   * Additive on purpose: `imageUrl` stays the one image every other surface
   * reads, so nothing outside the gallery has to know this list exists.
   */
  images?: string[];
  categorySlug: string;
  /** Admin-set "Акція" marker. Survives every УкрСклад import. */
  isPromo?: boolean;
  /** Admin-set "Топ продажів" marker. */
  isBestseller?: boolean;
}

/**
 * How many photos one product may carry, main photo included. A ceiling the
 * admin form, the API and the database sanitizer all share, so an accidental
 * multi-select of a hundred files cannot bloat a catalog row.
 */
export const MAX_PRODUCT_IMAGES = 8;

/**
 * Every photo of a product in display order: the main one first, then the
 * gallery. Empty entries and duplicates are dropped, so callers can treat the
 * result as a clean list (which is empty only if the product has no photo at
 * all — database rows always have at least the placeholder).
 */
export function getProductImages(product: Product): string[] {
  const seen = new Set<string>();
  for (const candidate of [product.imageUrl, ...(product.images ?? [])]) {
    const url = (candidate ?? "").trim();
    if (url) {
      seen.add(url);
    }
    if (seen.size >= MAX_PRODUCT_IMAGES) {
      break;
    }
  }
  return [...seen];
}

/**
 * Merchandising markers an admin can put on a product.
 *
 * Declared once so the admin checkboxes, the card badge and the catalog filter
 * can never drift apart. `field` is the column on `Product`; `column` is the
 * matching `products` column.
 */
export const PRODUCT_BADGES = [
  {
    field: "isPromo",
    column: "is_promo",
    label: "Акція",
    /** Tailwind classes for the badge pill on the product card. */
    className: "border-red-200 bg-red-500 text-white",
  },
  {
    field: "isBestseller",
    column: "is_bestseller",
    label: "Топ продажів",
    className: "border-amber-200 bg-amber-400 text-stone-900",
  },
] as const satisfies readonly {
  field: keyof Product;
  column: string;
  label: string;
  className: string;
}[];

export type ProductBadge = (typeof PRODUCT_BADGES)[number];

/** Badges actually set on a product, in declaration order. */
export function getProductBadges(product: Product): ProductBadge[] {
  return PRODUCT_BADGES.filter((badge) => product[badge.field] === true);
}

/**
 * Does this product match a free-text query?
 *
 * Matches name, description, article and barcode. Barcodes are compared with
 * separators stripped, so "482 000 123" finds "482000123". Null/absent values
 * are simply skipped.
 */
export function productMatchesQuery(product: Product, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  if (
    product.name.toLowerCase().includes(needle) ||
    product.shortDescription.toLowerCase().includes(needle) ||
    (product.sku ?? "").toLowerCase().includes(needle)
  ) {
    return true;
  }

  const barcode = (product.barcode ?? "").toLowerCase();
  if (!barcode) {
    return false;
  }
  if (barcode.includes(needle)) {
    return true;
  }
  // Digits-only comparison for barcodes typed/scanned with spaces or dashes.
  const digits = (value: string) => value.replace(/[^0-9]/g, "");
  const needleDigits = digits(needle);
  return needleDigits.length > 0 && digits(barcode).includes(needleDigits);
}

/**
 * All characteristics of a product as label/value pairs: the legacy fixed
 * `techSpecs` merged with the free-form `attributes`. Empty values are dropped.
 */
export function getProductAttributes(product: Product): [string, string][] {
  const merged = new Map<string, string>();

  const legacy: [string, string][] = [
    ["Потужність", product.techSpecs?.power ?? ""],
    ["Вага", product.techSpecs?.weight ?? ""],
    ["Гарантія", product.techSpecs?.warranty ?? ""],
  ];

  for (const [label, value] of legacy) {
    if (value.trim()) merged.set(label, value.trim());
  }
  // Free-form attributes win over the legacy fields on a label clash.
  for (const [label, value] of Object.entries(product.attributes ?? {})) {
    const key = label.trim();
    const val = String(value ?? "").trim();
    if (key && val) merged.set(key, val);
  }

  return [...merged.entries()];
}

export const categories: Category[] = [
  {
    slug: "petrol-tools",
    name: "Бензоінструмент",
    description:
      "Бензопили, мотокоси, тримери та кущорізи для саду, городу й заготівлі дров.",
    imageUrl: "https://placehold.co/600x400/1e2229/ff6b00.png?text=Petrol+Tools",
  },
  {
    slug: "power-tools",
    name: "Електроінструмент",
    description:
      "Дрилі, шліфувальні та інші електроінструменти для дому, ремонту та майстерні.",
    imageUrl: "https://placehold.co/600x400/1e2229/ff6b00.png?text=Power+Tools",
  },
  {
    slug: "garden-equipment",
    name: "Садова техніка",
    description:
      "Газонокосарки та техніка для догляду за газоном, садом і городом.",
    imageUrl: "https://placehold.co/600x400/1e2229/ff6b00.png?text=Garden",
  },
  {
    slug: "hand-tools",
    name: "Ручний інструмент",
    description:
      "Викрутки, ключі, молотки та інший ручний інструмент для щоденних робіт.",
    imageUrl: "https://placehold.co/600x400/1e2229/ff6b00.png?text=Hand+Tools",
  },
  {
    slug: "consumables",
    name: "Витратні матеріали",
    description:
      "Ланцюги, диски, мастила, волосінь та інші витратні матеріали й аксесуари.",
    imageUrl: "https://placehold.co/600x400/1e2229/ff6b00.png?text=Consumables",
  },
];

/**
 * Subcategories shown in the mega-menu. The УкрСклад export has no subcategory
 * column, so membership is inferred by matching `pattern` against the product
 * name (case-insensitive).
 */
export const subcategories: Subcategory[] = [
  // Бензоінструмент
  { slug: "chainsaws", name: "Бензопили", categorySlug: "petrol-tools", pattern: "бензопил" },
  { slug: "brushcutters", name: "Мотокоси та тримери", categorySlug: "petrol-tools", pattern: "мотокос|бензокос|тример|коса" },
  { slug: "hedge-trimmers", name: "Кущорізи", categorySlug: "petrol-tools", pattern: "кущоріз" },
  { slug: "augers", name: "Мотобури та мотоблоки", categorySlug: "petrol-tools", pattern: "мотобур|мотоблок" },
  // Електроінструмент
  { slug: "drills", name: "Дрилі та шуруповерти", categorySlug: "power-tools", pattern: "дриль|шурупов|перфоратор" },
  { slug: "grinders", name: "Болгарки та шліфмашини", categorySlug: "power-tools", pattern: "болгарк|кутошліф|шліфув" },
  { slug: "battery-tools", name: "Акумуляторна техніка", categorySlug: "power-tools", pattern: "акумулятор" },
  { slug: "power-station", name: "Генератори та стабілізатори", categorySlug: "power-tools", pattern: "генератор|стабілізатор|зарядн" },
  // Садова техніка
  { slug: "lawnmowers", name: "Газонокосарки", categorySlug: "garden-equipment", pattern: "газонокос" },
  { slug: "cultivators", name: "Аератори та культиватори", categorySlug: "garden-equipment", pattern: "аератор|культиватор" },
  { slug: "sprayers", name: "Обприскувачі", categorySlug: "garden-equipment", pattern: "обприскувач" },
  { slug: "pruners", name: "Секатори та сучкорізи", categorySlug: "garden-equipment", pattern: "секатор|сучкорі" },
  // Ручний інструмент
  { slug: "wrenches", name: "Ключі та викрутки", categorySlug: "hand-tools", pattern: "ключ|викрут" },
  { slug: "measuring", name: "Вимірювальний інструмент", categorySlug: "hand-tools", pattern: "рулетк|рівень" },
  { slug: "ladders", name: "Драбини та стрем'янки", categorySlug: "hand-tools", pattern: "драбин|стрем" },
  // Витратні матеріали
  { slug: "chains", name: "Ланцюги та шини", categorySlug: "consumables", pattern: "ланцюг|шина" },
  { slug: "spark-plugs", name: "Свічки запалення", categorySlug: "consumables", pattern: "свічк" },
  { slug: "oils", name: "Мастила та оливи", categorySlug: "consumables", pattern: "мастил|олив|масло|шампунь" },
  { slug: "lines-blades", name: "Волосінь та ножі", categorySlug: "consumables", pattern: "волосінь|ніж" },
];

export function getSubcategoriesByCategory(categorySlug: string): Subcategory[] {
  return subcategories.filter((sub) => sub.categorySlug === categorySlug);
}

/**
 * Which subcategory a product belongs to, inferred from its name the same way
 * the mega-menu does it. Returns `undefined` when nothing matches — plenty of
 * rows are generic enough to sit in a category without a subcategory.
 */
export function findSubcategory(product: Product): Subcategory | undefined {
  return subcategories.find(
    (sub) =>
      sub.categorySlug === product.categorySlug &&
      new RegExp(sub.pattern, "i").test(product.name),
  );
}

export function getSubcategoryBySlug(slug: string): Subcategory | undefined {
  return subcategories.find((sub) => sub.slug === slug);
}

/**
 * Product catalog.
 *
 * Intentionally EMPTY — products are no longer hardcoded in the codebase.
 * They are loaded at runtime from the external source (see `lib/ukrsklad.ts`),
 * and this array is only the last-resort fallback used when that source is
 * unavailable. Once the database is connected, populate the catalog from there
 * rather than adding entries here.
 */
export const products: Product[] = [];

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((category) => category.slug === slug);
}

export function getProductsByCategory(slug: string): Product[] {
  return products.filter((product) => product.categorySlug === slug);
}
