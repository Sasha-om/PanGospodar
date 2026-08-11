/**
 * Customer review domain types and rules.
 *
 * Reviews are moderated: a submission is stored as `PENDING` and stays
 * invisible to shoppers until an admin approves it, so the product page can
 * never be used as an open posting board.
 */

export const REVIEW_STATUSES = [
  { value: "PENDING", label: "На модерації" },
  { value: "APPROVED", label: "Опубліковано" },
  { value: "REJECTED", label: "Відхилено" },
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number]["value"];

export function reviewStatusLabel(value: string): string {
  return REVIEW_STATUSES.find((s) => s.value === value)?.label ?? value;
}

/** Only approved reviews are ever shown to shoppers or counted in a rating. */
export function isPublished(status: ReviewStatus): boolean {
  return status === "APPROVED";
}

/**
 * Name of the honeypot input on the review form. Hidden from people by CSS and
 * `tabindex`, but a bot that fills every field will set it.
 *
 * Lives here rather than beside the action because a `"use server"` module may
 * only export async functions.
 */
export const HONEYPOT_FIELD = "website";

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export const NAME_MIN = 2;
export const NAME_MAX = 60;
export const BODY_MIN = 10;
export const BODY_MAX = 2000;

/**
 * Spam limits, both keyed on a hashed IP.
 *
 * `PER_HOUR` blunts a burst across the whole catalog; `PER_PRODUCT_HOURS`
 * stops one product being buried under repeat posts from the same visitor.
 */
export const RATE_LIMIT = {
  perHour: 5,
  perProductHours: 24,
} as const;

export interface ReviewInput {
  productSku: string;
  authorName: string;
  rating: number;
  body: string;
  /** SHA-256 of the client IP — never the address itself. */
  ipHash: string;
}

export interface Review extends ReviewInput {
  id: number;
  status: ReviewStatus;
  createdAt: string;
  /** Product name, joined in for the admin list. */
  productName?: string;
}

/** Average rating and review count for one product. */
export interface ReviewStats {
  average: number;
  count: number;
}

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return REVIEW_STATUSES.some((status) => status.value === value);
}

/** 1–5, whole stars only. */
export function parseRating(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return null;
  }
  const rating = Math.round(value);
  return rating >= MIN_RATING && rating <= MAX_RATING ? rating : null;
}

/** Collapse runs of whitespace so padding cannot fake a long review. */
export function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Keep paragraph breaks but drop runaway blank lines. */
export function normalizeBody(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatReviewDate(value: string): string {
  return new Date(value).toLocaleDateString("uk-UA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** "3 відгуки" — Ukrainian plural for the review count. */
export function reviewCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} відгук`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} відгуки`;
  }
  return `${count} відгуків`;
}
