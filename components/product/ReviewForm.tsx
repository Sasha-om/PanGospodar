"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Star } from "lucide-react";
import { submitReview, type ReviewFormState } from "@/app/actions/reviews";
import { BODY_MAX, HONEYPOT_FIELD, MAX_RATING } from "@/lib/reviews";

const initialState: ReviewFormState = {};

const fieldClass =
  "w-full rounded-sm border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/40";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-600">{message}</p>;
}

/** 1–5 stars, click to pick. Submits the value in a hidden `rating` field. */
function RatingPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;

  return (
    <div
      className="flex items-center gap-1"
      role="radiogroup"
      aria-label="Оцінка товару"
      onMouseLeave={() => setHovered(0)}
    >
      {Array.from({ length: MAX_RATING }, (_, index) => index + 1).map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} з ${MAX_RATING}`}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          className="rounded-sm p-0.5 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        >
          <Star
            className={`h-7 w-7 ${
              star <= shown
                ? "fill-amber-400 text-amber-400"
                : "fill-stone-200 text-stone-300"
            }`}
            aria-hidden="true"
          />
        </button>
      ))}
      <input type="hidden" name="rating" value={value || ""} />
    </div>
  );
}

export default function ReviewForm({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState(
    submitReview,
    initialState,
  );
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const errors = state.fieldErrors ?? {};

  if (state.ok) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-sm border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden="true" />
        <h3 className="text-base font-bold text-emerald-900">
          Дякуємо за відгук!
        </h3>
        <p className="max-w-sm text-sm text-emerald-800">
          Ми опублікуємо його після перевірки модератором.
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-sm border border-stone-200 bg-white p-5"
    >
      <h3 className="text-base font-bold text-stone-800">Залишити відгук</h3>

      <input type="hidden" name="productId" value={productId} />

      {/* Honeypot: hidden from people, irresistible to bots. Not `display:none`
          — some bots skip those — but pulled out of the layout and the tab
          order, and marked so assistive tech ignores it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden opacity-0"
      >
        <label htmlFor="review-website">Не заповнюйте це поле</label>
        <input
          id="review-website"
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-stone-700">
          Ваша оцінка <span className="text-accent-600">*</span>
        </span>
        <RatingPicker value={rating} onChange={setRating} />
        <FieldError message={errors.rating} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="review-name" className="text-sm font-semibold text-stone-700">
          Ім&apos;я <span className="text-accent-600">*</span>
        </label>
        <input
          id="review-name"
          name="authorName"
          type="text"
          required
          maxLength={60}
          autoComplete="name"
          placeholder="Як вас підписати"
          className={fieldClass}
        />
        <FieldError message={errors.authorName} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="review-body" className="text-sm font-semibold text-stone-700">
          Відгук <span className="text-accent-600">*</span>
        </label>
        <textarea
          id="review-body"
          name="body"
          required
          rows={4}
          maxLength={BODY_MAX}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Поділіться враженнями від товару: що сподобалось, що ні"
          className={`${fieldClass} resize-y`}
        />
        <div className="flex items-center justify-between gap-3">
          <FieldError message={errors.body} />
          <span className="ml-auto shrink-0 text-xs text-stone-400">
            {body.length} / {BODY_MAX}
          </span>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-sm bg-accent-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Надсилаємо…" : "Надіслати відгук"}
        </button>
        <p className="text-xs text-stone-500">
          Відгук з&apos;явиться на сайті після перевірки модератором.
        </p>
      </div>
    </form>
  );
}
