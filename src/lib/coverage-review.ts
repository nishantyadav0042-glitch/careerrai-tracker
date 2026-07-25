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
 * Never reviewed, or a full interval has passed. Onboarding must be finished
 * first — a student mid-onboarding is already filling the matrix, and asking
 * them to review it in the same session would be absurd.
 */
export function isReviewDue(
  reviewedAt: string | null | undefined,
  onboardingCompleted: boolean,
  now: Date = new Date(),
): boolean {
  if (!onboardingCompleted) return false;
  const days = daysSinceReview(reviewedAt, now);
  return days === null || days >= REVIEW_INTERVAL_DAYS;
}

// The ladder (type, order, labels, guards) is defined ONCE in
// coverage-status.ts. This module re-exports it for its existing consumers
// and keeps only the review-cadence logic that is genuinely its own.
export {
  STATUS_ORDER, STATUS_LABEL, isCoverageStatus, isForwardMove,
  type CoverageStatus,
} from './coverage-status';

