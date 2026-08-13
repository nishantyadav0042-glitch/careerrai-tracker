// The weekly coverage review — mandatory for every student.
//
// Every engine downstream (Blueprint, pace ring, revision queue, daily insight,
// the coaching mirror) reads topic_coverage. If that matrix is filled once
// during onboarding and never touched again, every one of those engines is
// reasoning about a student who no longer exists. A weekly checkpoint is what
// keeps the whole system honest.
//
// The hard design constraint: it must be mandatory WITHOUT being punishing.
// Asking all 48 topics every week would be abandoned by week two, and an
// abandoned checkpoint is worse than none — it produces stale data that LOOKS
// fresh. So the review leads with the topics the student actually worked on
// since their last review (we know these from real completions), and keeps the
// full matrix one tap away.

export const REVIEW_INTERVAL_DAYS = 7;

/** Whole days since the last review; null when never reviewed. */
export function daysSinceReview(reviewedAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!reviewedAt) return null;
  const t = Date.parse(reviewedAt);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/**
 * A full interval has passed since the matrix was last known-good.
 *
 * ── The daily-nag bug (founder, 13 Aug: "this screen should come once a week
 * not daily… it comes daily whenever I open the app") ──────────────────────
 *
 * This used to return true whenever `reviewedAt` was null:
 *
 *     return days === null || days >= REVIEW_INTERVAL_DAYS;
 *
 * A student who has just finished onboarding — where they filled all 53 topics
 * minutes ago — has no review stamp yet. So the checkpoint fired immediately,
 * asking "where are you right now?" about a matrix that was the freshest data
 * in the system. And because the stamp is only written on submit, anyone who
 * closed the sheet instead of completing it got it again on the next app open,
 * and the next, forever. Measured the day it was found: 241 of 296 onboarded
 * students had never been stamped, so four out of five students were seeing a
 * "weekly" checkpoint every single time they opened the app.
 *
 * The fix is to start the clock where the data actually came from. Coverage is
 * filled during onboarding, so onboarding IS the first review — `filledAt`
 * (onboarding completion, falling back to account creation) anchors the first
 * interval. After that the student's own stamp takes over.
 *
 * With no anchor at all we return false rather than true: an unknown age is
 * not evidence of staleness, and guessing "stale" is what produced the nag.
 *
 * Onboarding must be finished first — a student mid-onboarding is already
 * filling the matrix, and asking them to review it in the same session would
 * be absurd.
 */
export function isReviewDue(
  reviewedAt: string | null | undefined,
  onboardingCompleted: boolean,
  now: Date = new Date(),
  filledAt?: string | null,
): boolean {
  if (!onboardingCompleted) return false;
  const anchor = reviewedAt ?? filledAt ?? null;
  const days = daysSinceReview(anchor, now);
  if (days === null) return false;
  return days >= REVIEW_INTERVAL_DAYS;
}

// The ladder (type, order, labels, guards) is defined ONCE in
// coverage-status.ts. This module re-exports it for its existing consumers
// and keeps only the review-cadence logic that is genuinely its own.
export {
  STATUS_ORDER, STATUS_LABEL, isCoverageStatus, isForwardMove,
  type CoverageStatus,
} from './coverage-status';

