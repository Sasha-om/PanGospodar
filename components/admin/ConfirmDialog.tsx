"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Підтвердити",
  cancelLabel = "Скасувати",
  tone = "default",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Close on Escape and lock background scroll while open.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onCancel]);

  const confirmClass =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : "bg-accent-500 hover:bg-accent-600";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-950/60 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
              tone === "danger"
                ? "bg-red-100 text-red-600"
                : "bg-accent-500/15 text-accent-600"
            }`}
          >
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 id="confirm-title" className="text-lg font-bold text-graphite-950">
              {title}
            </h2>
            <p id="confirm-message" className="mt-1 text-sm text-graphite-600">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-graphite-200 px-4 py-2 text-sm font-bold text-graphite-700 transition-colors hover:bg-graphite-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`rounded-lg px-4 py-2 text-sm font-bold text-white transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
