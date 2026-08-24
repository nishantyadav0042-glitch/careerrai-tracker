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

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export interface FeedbackInput {
  videoSessionId: string;
  rating: number;
  issueResolved: Resolution;
  wouldBookAgain?: boolean | null;
  whatHelped?: string | null;
  whatWasMissing?: string | null;
  sessionIntent?: SessionIntent | null;
}

export function isResolution(v: unknown): v is Resolution {
  return typeof v === 'string' && (RESOLUTIONS as readonly string[]).includes(v);
}

export type FeedbackValidation =
  | { ok: true; value: Required<Pick<FeedbackInput, 'rating' | 'issueResolved'>>
      & { wouldBookAgain: boolean | null; whatHelped: string | null; whatWasMissing: string | null } }
  | { ok: false; error: string };

/**
 * Validate before writing. The database enforces all of this too — this exists
 * to produce a sentence a student can act on rather than a constraint name.
 */
export function validateFeedback(input: {
  rating?: unknown; issueResolved?: unknown; wouldBookAgain?: unknown;
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
      wouldBookAgain: typeof input.wouldBookAgain === 'boolean' ? input.wouldBookAgain : null,
      whatHelped: text(input.whatHelped),
      whatWasMissing: text(input.whatWasMissing),
    },
  };
}

// ── Reading it back ─────────────────────────────────────────────────────────

export interface FeedbackRow {
  rating: number;
  issue_resolved: string;
  would_book_again: boolean | null;
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
    wouldBookAgain: rows.filter((r) => r.would_book_again === true).length,
  };
}
