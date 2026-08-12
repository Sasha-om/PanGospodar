const brands = ["STIHL", "Bosch", "Makita", "DeWalt", "AL-KO"];

/**
 * Scrolling brand marquee.
 *
 * The list is repeated four times and the track is shifted by exactly -50%, so
 * the second half lands where the first half started and the loop is seamless.
 * Four copies rather than two on purpose: two copies of five short words are
 * narrower than a wide desktop viewport, which used to leave a visible empty
 * stretch on every pass. The trailing `pr-12` matters as much as the gap — it
 * gives the last item of a copy the same spacing as every other item, which is
 * what makes -50% line up.
 */
export default function TrustedBrands() {
  const marqueeItems = [...brands, ...brands, ...brands, ...brands];

  return (
    <section className="border-b border-stone-200">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-stone-500">
          Провідні бренди
        </p>

        <div className="marquee-mask mt-6 overflow-hidden">
          <ul className="flex w-max animate-marquee items-center gap-12 pr-12 hover:[animation-play-state:paused]">
            {marqueeItems.map((brand, index) => (
              <li key={`${brand}-${index}`} aria-hidden={index >= brands.length}>
                <span className="select-none text-2xl font-black tracking-tight text-accent-500 transition-colors duration-100 hover:text-accent-600 sm:text-3xl">
                  {brand}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
