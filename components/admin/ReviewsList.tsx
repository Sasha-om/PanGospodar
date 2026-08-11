"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Loader2, MessageSquare, Star, Trash2, X } from "lucide-react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import {
  removeReview,
  updateReviewStatus,
  type ReviewActionResult,
} from "@/app/actions/admin-reviews";
import {
  MAX_RATING,
  formatReviewDate,
  reviewStatusLabel,
  type Review,
  type ReviewStatus,
} from "@/lib/reviews";

const STATUS_BADGE: Record<ReviewStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  REJECTED: "bg-red-100 text-red-700 ring-1 ring-red-200",
};

type TabId = "pending" | "approved" | "rejected" | "all";

/** Moderation opens on the queue — that is the only tab with work in it. */
const TABS: { id: TabId; label: string; statuses: ReviewStatus[] | null }[] = [
  { id: "pending", label: "На модерації", statuses: ["PENDING"] },
  { id: "approved", label: "Опубліковані", statuses: ["APPROVED"] },
  { id: "rejected", label: "Відхилені", statuses: ["REJECTED"] },
  { id: "all", label: "Усі", statuses: null },
];

function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="flex items-center gap-0.5"
      aria-label={`Оцінка ${rating} з ${MAX_RATING}`}
    >
      {Array.from({ length: MAX_RATING }, (_, index) => index + 1).map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating
              ? "fill-amber-400 text-amber-400"
              : "fill-stone-200 text-stone-200"
          }`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export default function ReviewsList({ reviews }: { reviews: Review[] }) {
  const [tab, setTab] = useState<TabId>("pending");
  const [toast, setToast] = useState<ReviewActionResult | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Review | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const byStatus = new Map<string, number>();
    for (const review of reviews) {
      byStatus.set(review.status, (byStatus.get(review.status) ?? 0) + 1);
    }
    return TABS.map((entry) => ({
      id: entry.id,
      count: entry.statuses
        ? entry.statuses.reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0)
        : reviews.length,
    }));
  }, [reviews]);

  const activeTab = TABS.find((entry) => entry.id === tab) ?? TABS[0];
  const visible = activeTab.statuses
    ? reviews.filter((review) => activeTab.statuses!.includes(review.status))
    : reviews;

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function applyStatus(id: number, status: ReviewStatus) {
    setBusyId(id);
    startTransition(async () => {
      const result = await updateReviewStatus(id, status);
      setBusyId(null);
      setToast(result);
    });
  }

  function applyDelete(id: number) {
    setBusyId(id);
    startTransition(async () => {
      const result = await removeReview(id);
      setBusyId(null);
      setToast(result);
    });
  }

  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-50 text-stone-400">
          <MessageSquare className="h-8 w-8" aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-base font-bold text-stone-800">
          Відгуків поки немає
        </h3>
        <p className="mt-1 max-w-xs text-sm text-stone-500">
          Відгуки покупців з&apos;являться тут одразу після надсилання.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Фільтр відгуків за статусом"
        className="flex flex-wrap gap-2 border-b border-stone-200 p-4"
      >
        {TABS.map((entry) => {
          const isActive = entry.id === tab;
          const count = counts.find((c) => c.id === entry.id)?.count ?? 0;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(entry.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                isActive
                  ? "bg-graphite-950 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {entry.label}
              <span
                className={`rounded-full px-1.5 text-xs font-semibold ${
                  isActive ? "bg-white/20" : "bg-white text-stone-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-stone-500">
          У цій категорії відгуків немає.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {visible.map((review) => {
            const busy = busyId === review.id && isPending;
            return (
              <li key={review.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-stone-800">
                        {review.authorName}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          STATUS_BADGE[review.status] ??
                          "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {reviewStatusLabel(review.status)}
                      </span>
                      <span className="text-xs text-stone-500">
                        {formatReviewDate(review.createdAt)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-stone-600">
                      Товар:{" "}
                      <span className="font-medium text-stone-800">
                        {review.productName ?? review.productSku}
                      </span>
                      <span className="ml-1.5 text-stone-400">
                        ({review.productSku})
                      </span>
                    </div>
                  </div>
                  <Stars rating={review.rating} />
                </div>

                <p className="mt-3 whitespace-pre-line rounded-sm border border-stone-200 bg-stone-50 p-3 text-sm leading-relaxed text-stone-700">
                  {review.body}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {review.status !== "APPROVED" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => applyStatus(review.id, "APPROVED")}
                      className="flex items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-bold text-emerald-700 transition-colors hover:border-emerald-400 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      )}
                      Опублікувати
                    </button>
                  ) : null}

                  {review.status !== "REJECTED" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => applyStatus(review.id, "REJECTED")}
                      className="flex items-center gap-2 rounded-sm border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-bold text-red-700 transition-colors hover:border-red-400 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      Відхилити
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPendingDelete(review)}
                    className="ml-auto flex items-center gap-2 rounded-sm border border-stone-200 px-3.5 py-2 text-sm font-bold text-stone-500 transition-colors hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Видалити
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pendingDelete ? (
        <ConfirmDialog
          tone="danger"
          title="Видалити відгук?"
          message={`Відгук від «${pendingDelete.authorName}» буде видалено назавжди. Цю дію не можна скасувати.`}
          confirmLabel="Видалити"
          cancelLabel="Ні, залишити"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            applyDelete(target.id);
          }}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 left-1/2 z-50 max-w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-sm border px-4 py-2.5 text-sm font-semibold shadow-lg ${
            toast.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
