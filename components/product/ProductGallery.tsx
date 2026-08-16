"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Product photo gallery: one large image plus a thumbnail strip.
 *
 * With a single photo it renders exactly what the page used to render — no
 * arrows, no strip — so a product without extra photos looks unchanged.
 *
 * The active index is clamped on every render rather than reset in an effect:
 * the catalog is re-fetched while the page is open, so the list can shrink
 * under the component, and clamping keeps that from blanking the image.
 */
export default function ProductGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return null;
  }

  const index = Math.min(Math.max(active, 0), images.length - 1);
  const step = (delta: number) =>
    setActive((images.length + index + delta) % images.length);

  return (
    <div className="flex flex-col gap-3">
      {/*
        Square by aspect ratio but never taller than 450px, so the photo block
        cannot push the buy buttons below the fold on a wide screen. The image
        is `object-contain`: supplier photos come in every proportion, and
        cropping a chainsaw to fill a square is worse than letterboxing it.
      */}
      <div className="relative aspect-square max-h-[450px] w-full overflow-hidden rounded-sm border border-stone-200 bg-white">
        <Image
          key={images[index]}
          src={images[index]}
          alt={
            images.length > 1 ? `${alt} — фото ${index + 1}` : alt
          }
          fill
          priority
          className="object-contain p-3"
          sizes="(max-width: 1024px) 100vw, 50vw"
        />

        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Попереднє фото"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-stone-200 bg-white/90 p-2 text-stone-700 shadow-sm transition-colors hover:bg-white hover:text-accent-600"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Наступне фото"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-stone-200 bg-white/90 p-2 text-stone-700 shadow-sm transition-colors hover:bg-white hover:text-accent-600"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-stone-950/70 px-2.5 py-1 text-xs font-semibold text-white">
              {index + 1} / {images.length}
            </span>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <ul className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          {images.map((url, position) => (
            <li key={url}>
              <button
                type="button"
                onClick={() => setActive(position)}
                aria-label={`Показати фото ${position + 1}`}
                aria-current={position === index}
                className={`relative block aspect-square w-full overflow-hidden rounded-sm border bg-white transition-colors ${
                  position === index
                    ? "border-accent-500"
                    : "border-stone-200 hover:border-accent-300"
                }`}
              >
                <Image
                  src={url}
                  alt=""
                  fill
                  className="object-contain p-1"
                  sizes="120px"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
