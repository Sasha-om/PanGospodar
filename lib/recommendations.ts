import { findSubcategory, subcategories, type Product } from "@/lib/products";

/**
 * Product recommendations for the product page.
 *
 * Two independent blocks:
 *
 *  - "Схожі товари" — alternatives to the item being viewed: same
 *    subcategory, closest in price.
 *  - "Купують разом" — complements: things you need *in addition*.
 *
 * Everything here is a pure function over the catalog. The one piece that needs
 * the database (real co-purchase history) is fetched by the caller and passed
 * in, so this module stays testable and usable from either side.
 */

/** A product is only worth recommending if it can actually be bought. */
function isSellable(product: Product): boolean {
  return product.inStock !== false && product.price > 0;
}

/**
 * Alternatives to `product`, closest in price first.
 *
 * Scope is the narrowest one that yields anything: the same subcategory
 * ("Бензопили") when the name matches one, otherwise the whole category. Price
 * proximity is the ranking signal because a customer comparing chainsaws is
 * almost always working within a budget.
 */
export function findSimilarProducts(
  product: Product,
  catalog: Product[],
  limit = 4,
): Product[] {
  const subcategory = findSubcategory(product);
  const sameCategory = catalog.filter(
    (candidate) =>
      candidate.id !== product.id &&
      candidate.categorySlug === product.categorySlug &&
      isSellable(candidate),
  );

  const pool = subcategory
    ? sameCategory.filter((candidate) =>
        new RegExp(subcategory.pattern, "i").test(candidate.name),
      )
    : [];

  // Fall back to the whole category when the subcategory is too thin to fill
  // the row — an empty block looks broken, a slightly looser one does not.
  const candidates = pool.length >= limit ? pool : sameCategory;

  return [...candidates]
    .sort(
      (a, b) =>
        Math.abs(a.price - product.price) - Math.abs(b.price - product.price),
    )
    .slice(0, limit);
}

/**
 * Which subcategories hold the consumables a given product needs.
 *
 * Keyed by the *tool's* subcategory slug; the values are subcategory slugs from
 * "Витратні матеріали". A petrol saw needs a chain, bar oil and a spark plug;
 * a trimmer needs line and a blade. Tools with no dedicated consumable
 * subcategory (drills, grinders) are absent on purpose and fall through to the
 * generic consumables pool below.
 */
const ACCESSORIES_BY_SUBCATEGORY: Record<string, string[]> = {
  chainsaws: ["chains", "oils", "spark-plugs"],
  brushcutters: ["lines-blades", "oils", "spark-plugs"],
  "hedge-trimmers": ["oils", "spark-plugs"],
  augers: ["oils", "spark-plugs"],
  lawnmowers: ["lines-blades", "oils"],
  cultivators: ["oils", "spark-plugs"],
  sprayers: ["oils"],
  pruners: ["oils"],
  "power-station": ["oils", "spark-plugs"],
};

/** Coarser fallback when the product matched no subcategory at all. */
const ACCESSORIES_BY_CATEGORY: Record<string, string[]> = {
  "petrol-tools": ["oils", "spark-plugs", "chains"],
  "garden-equipment": ["oils", "lines-blades"],
  "power-tools": ["oils"],
  "hand-tools": [],
  consumables: [],
};

/** Ranked accessory subcategory slugs for a product. */
function accessorySubcategories(product: Product): string[] {
  const subcategory = findSubcategory(product);
  const bySub = subcategory
    ? ACCESSORIES_BY_SUBCATEGORY[subcategory.slug]
    : undefined;
  return bySub ?? ACCESSORIES_BY_CATEGORY[product.categorySlug] ?? [];
}

/** Does this product belong to the given subcategory slug? */
function inSubcategory(product: Product, slug: string): boolean {
  const sub = subcategories.find((entry) => entry.slug === slug);
  return sub ? new RegExp(sub.pattern, "i").test(product.name) : false;
}

/**
 * Complements — what to buy together with `product`.
 *
 * Three tiers, in order of how much we trust them:
 *
 *  1. **Real history.** `coPurchasedSkus` comes from the `orders` table:
 *     SKUs that appeared in the same basket, most frequent first. This is the
 *     only genuine "купують разом" signal.
 *  2. **Category rules.** The order table is young, so tier 1 is usually empty.
 *     We then suggest the consumables the tool actually needs — a chain and bar
 *     oil for a saw, line for a trimmer — using the mapping above.
 *  3. **Generic consumables.** For tools with no dedicated accessory
 *     subcategory (a drill, a wrench) we fall back to the cheapest sellable
 *     items from "Витратні матеріали", so the block is never empty.
 *
 * A price ceiling applies to tiers 2 and 3: an accessory must cost less than
 * the tool itself, otherwise the block starts recommending a second chainsaw.
 * The ceiling is skipped when the product *is* a consumable, where the pairing
 * is oil + chain rather than tool + accessory.
 */
export function findBoughtTogether(
  product: Product,
  catalog: Product[],
  coPurchasedSkus: string[] = [],
  limit = 4,
): Product[] {
  const bySku = new Map(catalog.map((item) => [item.sku ?? item.id, item]));
  const picked: Product[] = [];
  const seen = new Set<string>([product.id]);

  const take = (candidate: Product | undefined) => {
    if (!candidate || seen.has(candidate.id) || picked.length >= limit) {
      return;
    }
    seen.add(candidate.id);
    picked.push(candidate);
  };

  // Tier 1 — what customers really bought together.
  for (const sku of coPurchasedSkus) {
    const candidate = bySku.get(sku);
    if (candidate && isSellable(candidate)) {
      take(candidate);
    }
  }
  if (picked.length >= limit) {
    return picked;
  }

  const isConsumable = product.categorySlug === "consumables";
  const ownSubcategory = findSubcategory(product);
  const cheaper = (candidate: Product) =>
    isConsumable || candidate.price < product.price;

  const accessoryPool = catalog.filter(
    (candidate) =>
      candidate.id !== product.id &&
      isSellable(candidate) &&
      cheaper(candidate) &&
      // Pairing two oils together helps nobody — for a consumable, look for a
      // *different* kind of consumable.
      !(
        isConsumable &&
        ownSubcategory &&
        inSubcategory(candidate, ownSubcategory.slug)
      ),
  );

  // Tier 2 — the consumables this tool needs, in the order the rules list them.
  for (const slug of accessorySubcategories(product)) {
    const matches = accessoryPool
      .filter((candidate) => inSubcategory(candidate, slug))
      .sort((a, b) => a.price - b.price);
    for (const candidate of matches) {
      take(candidate);
    }
    if (picked.length >= limit) {
      return picked;
    }
  }

  // Tier 3 — anything from "Витратні матеріали", cheapest first.
  const generic = accessoryPool
    .filter((candidate) => candidate.categorySlug === "consumables")
    .sort((a, b) => a.price - b.price);
  for (const candidate of generic) {
    take(candidate);
  }

  return picked;
}
