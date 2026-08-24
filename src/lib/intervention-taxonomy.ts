// ── The intervention taxonomy — CareerRai's learning vocabulary ─────────────
//
// Founder, 24 Aug 2026: "Every conversation must potentially teach CareerRai
// something." This module is the controlled vocabulary that makes that
// possible. One student saying "the coaching timetable doesn't match my plan"
// is an anecdote; thirty-seven saying it is a product requirement — but only
// if the reason was recorded as a CATEGORY rather than buried in free text.
// Free text cannot aggregate, and aggregation is the entire point.
//
// WHY A CLOSED VOCABULARY, AND HOW IT EVOLVES SAFELY
// A category is a permanent claim about history: once 200 interventions are
// tagged `no_time`, that tag must keep meaning the same thing forever, or
// every trend built on it silently lies. So:
//   · categories are APPEND-ONLY — never rename, never repurpose, never delete
//   · a retired category stays readable (see RETIRED_REASONS) so old rows keep
//     their meaning
//   · `other` always exists, and its free text is the intake queue for the
//     next category — when one verbatim keeps recurring, it earns a code
//
// These are NOT invented. Each one below traces to something already observed
// in this codebase or in the founder's own words during the 24 Aug review.

/** What the REP was trying to do. Four types, matching the queue's lanes. */
export const INTERVENTION_TYPES = [
  'activation',   // never logged — help them finish day 1
  'restart',      // had a rhythm, lost it — win the habit back
  'diagnostic',   // opened but not logging — listen, ask nothing
  'conversion',   // declared mentor intent — explain the session honestly
] as const;
export type InterventionType = (typeof INTERVENTION_TYPES)[number];

/**
 * What the STUDENT said. This is the product-intelligence field.
 *
 * Ordering is deliberate: product-fixable causes first, because those are the
 * ones that can stop being reasons at all.
 */
export const REASON_CATEGORIES = [
  // ── Product-fixable: CareerRai could remove these ──
  'coaching_timetable_conflict', // plan disagrees with their real class schedule
  'plan_not_relevant',           // the plan does not match where they actually are
  'app_confusing',               // could not find or understand what to do
  'never_saw_notification',      // the return trigger never reached them
  'technical_issue',             // something broke

  // ── Student-side: real, but not ours to fix directly ──
  'no_time',                     // work/college/family load
  'exam_far_away',               // no urgency yet
  'overwhelmed',                 // knows what to do, cannot start
  'exam_anxiety',                // emotional block, not a scheduling one
  'using_other_prep',            // already has a plan or another app

  // ── Commercial ──
  'wanted_mentor',               // asked about a buddy / session
  'price',                       // wants it, cannot or will not pay

  // ── Terminal ──
  'not_interested',              // does not want CareerRai
  'wrong_number',                // not the student
  'other',                       // MUST carry verbatim — the intake queue
] as const;
export type ReasonCategory = (typeof REASON_CATEGORIES)[number];

/**
 * Retired codes stay here forever so historical rows remain readable.
 * Empty today — the first entry will be the first honest mistake we make.
 */
export const RETIRED_REASONS: readonly string[] = [] as const;

/** Categories a PRODUCT change could plausibly eliminate. The founder's
 *  "which of these are our fault?" filter, computed rather than eyeballed. */
export const PRODUCT_FIXABLE_REASONS: ReadonlySet<ReasonCategory> = new Set([
  'coaching_timetable_conflict', 'plan_not_relevant', 'app_confusing',
  'never_saw_notification', 'technical_issue',
]);

export const REASON_LABEL: Record<ReasonCategory, string> = {
  coaching_timetable_conflict: 'Coaching timetable clashes with the plan',
  plan_not_relevant: 'Plan does not match where they are',
  app_confusing: 'Could not figure out the app',
  never_saw_notification: 'Never saw our reminders',
  technical_issue: 'Something broke',
  no_time: 'No time (work / college / family)',
  exam_far_away: 'Exam feels far away',
  overwhelmed: 'Overwhelmed, cannot start',
  exam_anxiety: 'Exam anxiety',
  using_other_prep: 'Using other prep / another app',
  wanted_mentor: 'Wants a mentor / session',
  price: 'Price',
  not_interested: 'Not interested',
  wrong_number: 'Wrong number',
  other: 'Other (write what they said)',
};

/** The outcome window. Fixed, because a moving window makes trends unreadable. */
export const OUTCOME_WINDOW_DAYS = [1, 3, 7] as const;

export function isInterventionType(v: unknown): v is InterventionType {
  return typeof v === 'string' && (INTERVENTION_TYPES as readonly string[]).includes(v);
}
export function isReasonCategory(v: unknown): v is ReasonCategory {
  return typeof v === 'string' && (REASON_CATEGORIES as readonly string[]).includes(v);
}

/**
 * `other` without the student's actual words is a lost lesson — it records
 * that something happened while destroying what it was. This is the one
 * validation rule the taxonomy enforces on its own.
 */
export function reasonNeedsVerbatim(reason: ReasonCategory | null | undefined): boolean {
  return reason === 'other';
}
