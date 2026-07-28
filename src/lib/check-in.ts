// ── The daily check-in ──────────────────────────────────────────────────────
//
// A LEAF module (imports nothing) owning the vocabulary of the check-in, so
// the gate and the full log sheet cannot drift apart. Before this existed,
// BLOCKER_REASONS lived as a private array inside LoggingModal — the moment a
// second surface asked the same question it would have been copied, and a
// value added in one place would silently be rejected by the other.
//
// Language matters here more than anywhere else in the product. This is a
// CHECK-IN, never a "mandatory log". Students tolerate reflection and resent
// admin, and the same 30 seconds framed either way produces different
// completion rates. Nothing in this file should ever read as a demand.

export type DayOutcome = 'studied' | 'partial' | 'not_studied' | 'skipped';

export interface OutcomeOption {
  id: DayOutcome;
  emoji: string;
  label: string;
  sub: string;
  /** Does this answer deserve the "what got in the way?" follow-up? */
  asksWhy: boolean;
}

export const OUTCOME_OPTIONS: OutcomeOption[] = [
  { id: 'studied',     emoji: '✅', label: 'Studied',        sub: 'Got through the plan',      asksWhy: false },
  // 'partial' asks why as well, deliberately. It is the most common honest day
  // and the most diagnostic one: someone who sat down and did not finish is
  // telling us the PLAN is wrong, which is a product signal we can act on.
  { id: 'partial',     emoji: '📚', label: 'Studied a bit',  sub: "Sat down, didn't finish",   asksWhy: true  },
  { id: 'not_studied', emoji: '⭕', label: "Didn't study",   sub: 'The day got away',          asksWhy: true  },
  { id: 'skipped',     emoji: '⏭', label: 'Rest day',       sub: 'Planned break, away, ill',  asksWhy: false },
];

// ── Why the day didn't happen ───────────────────────────────────────────────
//
// The whole point of the check-in. Today a student who vanishes is
// indistinguishable from a student who was at work — and those need completely
// different products. One needs a lighter plan; the other needs nothing from
// us at all.
//
// Ordered by how often we expect them, so the common answer is the first tap.
// 'unclear_what_to_study' is the one that indicts US rather than the student,
// which is exactly why it must be on the list.
export interface BlockerReason { value: string; label: string }

export const BLOCKER_REASONS: BlockerReason[] = [
  { value: 'office',                label: 'Work' },
  { value: 'college',               label: 'College' },
  { value: 'plan_too_heavy',        label: 'Plan was too heavy' },
  { value: 'unclear_what_to_study', label: "Didn't know what to study" },
  { value: 'lost_motivation',       label: 'Lost motivation' },
  { value: 'health',                label: 'Health' },
  { value: 'family',                label: 'Family' },
  { value: 'travel',                label: 'Travel' },
  { value: 'mock_ran_long',         label: 'Mock ran long' },
  { value: 'other',                 label: 'Something else' },
];

/** The server's allow-list. Kept here so client and route share one source. */
export const VALID_BLOCKER_REASONS: readonly string[] = [
  ...BLOCKER_REASONS.map((r) => r.value),
  // Retired from the UI but still present in historical rows — never reject
  // a value we ourselves once wrote.
  'procrastination',
];

export const VALID_DAY_OUTCOMES: readonly DayOutcome[] =
  OUTCOME_OPTIONS.map((o) => o.id);

export function isDayOutcome(v: unknown): v is DayOutcome {
  return typeof v === 'string' && (VALID_DAY_OUTCOMES as readonly string[]).includes(v);
}

export function isBlockerReason(v: unknown): boolean {
  return typeof v === 'string' && VALID_BLOCKER_REASONS.includes(v);
}

export function outcomeAsksWhy(o: DayOutcome): boolean {
  return OUTCOME_OPTIONS.find((x) => x.id === o)?.asksWhy === true;
}
