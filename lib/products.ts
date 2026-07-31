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
  imageUrl: string;
  categorySlug: string;
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

export function getSubcategoryBySlug(slug: string): Subcategory | undefined {
  return subcategories.find((sub) => sub.slug === slug);
}

export const products: Product[] = [
  {
    id: "benzotrymer-stihl-fs-55",
    sku: "00101",
    name: "Бензотример STIHL FS 55",
    brand: "STIHL",
    price: 8499,
    quantity: 5,
    inStock: true,
    rating: 4.8,
    reviewCount: 24,
    shortDescription:
      "Легкий та надійний бензиновий тример для догляду за газоном, дачею та присадибною ділянкою.",
    techSpecs: {
      power: "0.8 кВт",
      weight: "4.5 кг",
      warranty: "24 місяці",
    },
    imageUrl: "https://placehold.co/600x600/e5e5e5/1a1a1a.png?text=STIHL+FS+55",
    categorySlug: "petrol-tools",
  },
  {
    id: "benzopyla-stihl-ms-180",
    sku: "00102",
    name: "Бензопила STIHL MS 180",
    brand: "STIHL",
    price: 9999,
    quantity: 3,
    inStock: true,
    rating: 5,
    reviewCount: 31,
    shortDescription:
      "Компактна та надійна побутова бензопила для заготівлі дров, обрізки дерев і робіт на присадибній ділянці.",
    techSpecs: {
      power: "1.5 кВт",
      weight: "3.9 кг",
      warranty: "24 місяці",
    },
    imageUrl: "https://placehold.co/600x600/e5e5e5/1a1a1a.png?text=STIHL+MS+180",
    categorySlug: "petrol-tools",
  },
  {
    id: "drel-udarna-bosch-gsb-13",
    sku: "00103",
    name: "Дриль ударний Bosch GSB 13 RE",
    brand: "Bosch",
    price: 2199,
    quantity: 12,
    inStock: true,
    rating: 4.6,
    reviewCount: 47,
    shortDescription:
      "Універсальний ударний дриль для свердління бетону, металу та дерева в побуті та на об'єкті.",
    techSpecs: {
      power: "600 Вт",
      weight: "1.8 кг",
      warranty: "24 місяці",
    },
    imageUrl: "https://placehold.co/600x600/e5e5e5/1a1a1a.png?text=Bosch+GSB+13",
    categorySlug: "power-tools",
  },
  {
    id: "kutoshlifmashyna-makita-9557",
    sku: "00104",
    name: "Кутошліфувальна машина Makita 9557NB",
    brand: "Makita",
    price: 1899,
    quantity: 0,
    inStock: false,
    rating: 4.4,
    reviewCount: 18,
    shortDescription:
      "Компактна болгарка для різання та шліфування металу, каменю та плитки.",
    techSpecs: {
      power: "840 Вт",
      weight: "1.9 кг",
      warranty: "12 місяців",
    },
    imageUrl: "https://placehold.co/600x600/e5e5e5/1a1a1a.png?text=Makita+9557",
    categorySlug: "power-tools",
  },
  {
    id: "gazonokosarka-al-ko-classic-3-82",
    sku: "00105",
    name: "Газонокосарка AL-KO Classic 3.82 SE",
    brand: "AL-KO",
    price: 15499,
    quantity: 2,
    inStock: true,
    rating: 4.7,
    reviewCount: 12,
    shortDescription:
      "Електрична газонокосарка з травозбірником для акуратного догляду за газоном.",
    techSpecs: {
      power: "1.4 кВт",
      weight: "22 кг",
      warranty: "24 місяці",
    },
    imageUrl: "https://placehold.co/600x600/e5e5e5/1a1a1a.png?text=AL-KO+3.82",
    categorySlug: "garden-equipment",
  },
  {
    id: "kushchoriz-einhell-gc-hh-9046",
    sku: "00106",
    name: "Кущоріз Einhell GC-HH 9046",
    brand: "Einhell",
    price: 3299,
    quantity: 7,
    inStock: true,
    rating: 4.5,
    reviewCount: 9,
    shortDescription:
      "Бензиновий кущоріз для формування живоплотів та обрізки чагарників на дачі.",
    techSpecs: {
      power: "0.75 кВт",
      weight: "5.8 кг",
      warranty: "24 місяці",
    },
    imageUrl: "https://placehold.co/600x600/e5e5e5/1a1a1a.png?text=Einhell+9046",
    categorySlug: "petrol-tools",
  },
];

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((category) => category.slug === slug);
}

export function getProductsByCategory(slug: string): Product[] {
  return products.filter((product) => product.categorySlug === slug);
}
