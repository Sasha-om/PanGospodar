const brands = ["STIHL", "Bosch", "Makita", "DeWalt", "AL-KO"];

export default function TrustedBrands() {
  // Rendered twice so the marquee can loop seamlessly (translateX -50%).
  const marqueeItems = [...brands, ...brands];

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
                <span className="select-none text-2xl font-black tracking-tight text-stone-300 transition-colors duration-100 hover:text-accent-500 sm:text-3xl">
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
