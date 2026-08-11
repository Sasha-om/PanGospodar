import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ReviewsList from "@/components/admin/ReviewsList";
import { hasDatabase, listReviews } from "@/lib/db";
import type { Review } from "@/lib/reviews";

// The moderation queue must never be served from a cache.
export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  // The /admin layout already enforces the session, so this is authorized.
  let reviews: Review[] = [];
  let error: string | null = null;

  if (!hasDatabase()) {
    error = "База даних не налаштована — відгуки недоступні.";
  } else {
    try {
      reviews = await listReviews(200);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      console.error(`[admin/reviews] ${error}`);
    }
  }

  const pending = reviews.filter((review) => review.status === "PENDING").length;

  return (
    <div className="flex min-h-screen flex-col bg-stone-100">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <div>
            <h1 className="text-2xl font-extrabold text-stone-800">Відгуки</h1>
            <p className="mt-1 text-sm text-stone-500">
              {pending > 0
                ? `На модерації: ${pending}`
                : "Усі відгуки перевірено."}
            </p>
          </div>
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-sm border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 transition-colors hover:border-accent-500 hover:text-accent-600"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            До адмін-панелі
          </Link>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {error ? (
          <p className="mb-4 rounded-sm border-l-4 border-accent-500 bg-accent-50 px-4 py-3 text-sm text-stone-700">
            {error}
          </p>
        ) : null}

        <div className="rounded-sm border border-stone-200 bg-white">
          <ReviewsList reviews={reviews} />
        </div>
      </main>
    </div>
  );
}
