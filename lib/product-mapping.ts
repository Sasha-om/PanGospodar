import { categories } from "@/lib/products";

/**
 * Shared product normalization used by every catalog source (database import,
 * file sync). Accounting systems rarely provide a brand or a web category, so
 * we recover both from the product name with the same rules everywhere.
 */

/** Local asset used when a source has no usable image URL. */
export const LOCAL_PLACEHOLDER = "/placeholder-product.svg";

export const KNOWN_SLUGS = new Set(categories.map((category) => category.slug));

/** Common tool-market brands, recovered from the product name. */
const KNOWN_BRANDS = [
  "STIHL",
  "Husqvarna",
  "Bosch",
  "Makita",
  "Metabo",
  "DeWalt",
  "AL-KO",
  "Einhell",
  "Oregon",
  "NGK",
  "Forte",
  "Stark",
  "APRO",
  "Sadko",
  "Vitals",
  "Dnipro-M",
  "Grunhelm",
  "Sturm",
  "Intertool",
  "Sigma",
  "Yato",
  "Neo Tools",
  "Bautec",
  "Werk",
  "Tekhmann",
  "Vorskla",
  "Rebir",
  "Patriot",
  "Vega",
  "Kraft",
];

/** A "manufacturer" column often holds a country of origin, not a brand. */
const COUNTRY_VALUES = new Set([
  "польща",
  "австрія",
  "бразилія",
  "китай",
  "німеччина",
  "сша",
  "угорщина",
  "італія",
  "україна",
  "туреччина",
  "франція",
  "японія",
  "іспанія",
  "чехія",
  "румунія",
  "індія",
  "тайвань",
  "корея",
  "південна корея",
  "великобританія",
  "білорусь",
  "словаччина",
  "словенія",
  "нідерланди",
  "в'єтнам",
]);

export function detectBrand(explicit: string, name: string): string {
  const trimmed = explicit.trim();
  if (trimmed && !COUNTRY_VALUES.has(trimmed.toLowerCase())) {
    return trimmed;
  }
  const lower = name.toLowerCase();
  return KNOWN_BRANDS.find((brand) => lower.includes(brand.toLowerCase())) ?? "";
}

/** Map an explicit group name onto one of the site's category slugs. */
export function mapCategory(rawGroup: string): string {
  const group = rawGroup.toLowerCase();
  if (/бензо|мотокос|мотобур|мотоблок|petrol/.test(group)) return "petrol-tools";
  if (/сад|газон|garden|город/.test(group)) return "garden-equipment";
  if (/електро|electric|power|акум/.test(group)) return "power-tools";
  if (/ручн|hand|слюсар/.test(group)) return "hand-tools";
  if (/витрат|consumable|аксесуар|запчаст/.test(group)) return "consumables";
  return "consumables";
}

/**
 * Infer a category from the product name — used when the source has no category
 * column. Heuristic and best-effort; genuine parts, oils and accessories fall
 * through to "consumables", which is correct for them.
 */
export function inferCategory(name: string): string {
  const n = name.toLowerCase();
  if (/бензопил|мотокос|бензокос|мотобур|мотоблок|бензо/.test(n)) return "petrol-tools";
  if (/газонокос|аератор|культиватор|обприскувач|секатор|сучкорі|кущорі|тример|коса|садов|газон/.test(n)) {
    return "garden-equipment";
  }
  if (
    /дриль|шурупов|перфоратор|болгарк|шліфув|лобзик|фрезер|електропил|стабіліз|зарядн|компресор|генератор|зварюв|степлер|електро|акумуляторн/.test(n)
  ) {
    return "power-tools";
  }
  if (/ключ|викрут|молот|пасатиж|плоскогуб|рулетк|рівень|ножівк|стамеск|лещат|стрем|драбин/.test(n)) {
    return "hand-tools";
  }
  return "consumables";
}

export function resolveImage(rawImage: string): string {
  if (/^https?:\/\//i.test(rawImage) || rawImage.startsWith("/")) {
    return rawImage;
  }
  // Blob references, empty values, etc. → local placeholder.
  return LOCAL_PLACEHOLDER;
}

/** Ensure a slug is one the site actually renders. */
export function safeCategorySlug(slug: string): string {
  return KNOWN_SLUGS.has(slug) ? slug : "consumables";
}
