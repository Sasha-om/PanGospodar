const brands = ["STIHL", "Bosch", "Makita", "DeWalt", "AL-KO"];

/**
 * Solid orange brand band.
 *
 * Deliberately static: the previous version scrolled the list with a CSS
 * marquee, which needed a duplicated list, a fade mask and a hover pause — and
 * still jumped on wide screens, where the doubled list is narrower than the
 * viewport. A wrapping flex row has nothing to go wrong at any width and reads
 * the same on every device.
 */
export default function TrustedBrands() {
  return (
    <section className="border-y border-accent-600 bg-accent-500">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-white/85">
          Провідні бренди
        </p>

        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:gap-x-12">
          {brands.map((brand) => (
            <li
              key={brand}
              className="select-none text-2xl font-black tracking-tight text-white sm:text-3xl"
            >
              {brand}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
