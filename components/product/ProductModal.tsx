"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Dialog shell for the product-page order forms.
 *
 * Taller than the viewport on small screens, so the panel itself scrolls while
 * the background stays locked.
 */
export default function ProductModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog so the keyboard lands somewhere useful.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-graphite-950/60 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        onClick={(event) => event.stopPropagation()}
        className="my-auto w-full max-w-2xl rounded-sm bg-white shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
          <div>
            <h2
              id="product-modal-title"
              className="text-lg font-extrabold text-stone-800"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-stone-600">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="shrink-0 rounded-sm p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
