import type { SessionIntent } from '@/lib/session-intent';

// ── The student rating the session ──────────────────────────────────────────
//
// A NEW authority, deliberately. The repo already has two things that look
// like this and are not:
//   buddy_feedback  — the MENTOR writing about the student (opposite direction)
//   rating_prompts  — the App Store / Play Store ask (a different product)
// Overloading either would have corrupted a meaning that already exists.
//
// THE RULE THAT MATTERS: a mentor pressing "Complete" is not what makes a
// session real. `started_at` / `ended_at` remain the delivery authority. This
// records what the STUDENT thought of a session the product already believes
// happened — and only a `completed` session is rateable at all, enforced by a
// trigger, so no quality average can ever include a call that never took place.

export const RESOLUTIONS = ['fully', 'partly', 'not_at_all'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const RESOLUTION_LABEL: Record<Resolution, string> = {
  fully: 'Yes, completely',
  partly: 'Partly',
  not_at_all: 'Not really',
};

// How useful the HOUR was — separate from rating (the person) and
// issue_resolved (the outcome). A student can like their mentor, leave with
// the issue partly solved, and still feel the hour was only somewhat useful.
// Those are three facts, and only three fields can hold them.
export const USEFULNESS = ['very', 'useful', 'somewhat', 'not'] as const;
export type Usefulness = (typeof USEFULNESS)[number];

export const USEFULNESS_LABEL: Record<Usefulness, string> = {
  very: 'Very useful',
  useful: 'Useful',
  somewhat: 'Somewhat useful',
  not: 'Not useful',
};

// 'maybe' is a real answer, not a soft no. A boolean here would have
// manufactured a rejection from a student who was simply undecided.
export const BOOK_AGAIN = ['yes', 'maybe', 'no'] as const;
export type BookAgain = (typeof BOOK_AGAIN)[number];

export const BOOK_AGAIN_LABEL: Record<BookAgain, string> = {
  yes: 'Yes', maybe: 'Maybe', no: 'No',
};

export function isUsefulness(v: unknown): v is Usefulness {
  return typeof v === 'string' && (USEFULNESS as readonly string[]).includes(v);
}
export function isBookAgain(v: unknown): v is BookAgain {
  return typeof v === 'string' && (BOOK_AGAIN as readonly string[]).includes(v);
}

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export interface FeedbackInput {
  videoSessionId: string;
  rating: number;
  issueResolved: Resolution;
  usefulness?: Usefulness | null;
  bookAgain?: BookAgain | null;
  whatHelped?: string | null;
  whatWasMissing?: string | null;
  sessionIntent?: SessionIntent | null;
}

export function isResolution(v: unknown): v is Resolution {
  return typeof v === 'string' && (RESOLUTIONS as readonly string[]).includes(v);
}

export type FeedbackValidation =
  | { ok: true; value: {
      rating: number; issueResolved: Resolution;
      usefulness: Usefulness | null; bookAgain: BookAgain | null;
      whatHelped: string | null; whatWasMissing: string | null } }
  | { ok: false; error: string };

/**
 * Validate before writing. The database enforces all of this too — this exists
 * to produce a sentence a student can act on rather than a constraint name.
 */
export function validateFeedback(input: {
  rating?: unknown; issueResolved?: unknown; usefulness?: unknown; bookAgain?: unknown;
  whatHelped?: unknown; whatWasMissing?: unknown;
}): FeedbackValidation {
  const rating = typeof input.rating === 'number' ? input.rating : Number(input.rating);
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    return { ok: false, error: `Pick a rating from ${MIN_RATING} to ${MAX_RATING}.` };
  }
  if (!isResolution(input.issueResolved)) {
    return { ok: false, error: 'Tell us whether the session solved what you came for.' };
  }
  const text = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length === 0 ? null : t.slice(0, 2000);
  };
  return {
    ok: true,
    value: {
      rating,
      issueResolved: input.issueResolved,
      // Unanswered stays null. "Did not say" and "said no" are different facts,
      // and only one of them is a rejection.
      usefulness: isUsefulness(input.usefulness) ? input.usefulness : null,
      bookAgain: isBookAgain(input.bookAgain) ? input.bookAgain : null,
      whatHelped: text(input.whatHelped),
      whatWasMissing: text(input.whatWasMissing),
    },
  };
}

// ── Reading it back ─────────────────────────────────────────────────────────

export interface FeedbackRow {
  rating: number;
  issue_resolved: string;
  usefulness: string | null;
  book_again: string | null;
  session_intent: string | null;
}

export interface FeedbackSummary {
  count: number;
  /** null below the sample floor — never a confident average over three rows. */
  averageRating: number | null;
  resolvedFully: number;
  resolvedPartly: number;
  notResolved: number;
  wouldBookAgain: number;
  foundItUseful: number;
}

/** Below this an average is one student's mood wearing a decimal point. */
export const MIN_FEEDBACK_FOR_AVERAGE = 5;

export function summarise(rows: readonly FeedbackRow[]): FeedbackSummary {
  const count = rows.length;
  const total = rows.reduce((n, r) => n + r.rating, 0);
  return {
    count,
    averageRating: count >= MIN_FEEDBACK_FOR_AVERAGE
      ? Math.round((total / count) * 10) / 10
      : null,
    resolvedFully: rows.filter((r) => r.issue_resolved === 'fully').length,
    resolvedPartly: rows.filter((r) => r.issue_resolved === 'partly').length,
    notResolved: rows.filter((r) => r.issue_resolved === 'not_at_all').length,
    // Only an explicit yes counts. 'maybe' is neither a yes nor a no, and
    // folding it either way would be the company deciding on the student's
    // behalf what they meant.
    wouldBookAgain: rows.filter((r) => r.book_again === 'yes').length,
    foundItUseful: rows.filter((r) => r.usefulness === 'very' || r.usefulness === 'useful').length,
  };
}
