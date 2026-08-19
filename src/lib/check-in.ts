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

// ONE array, both surfaces. The gate (yesterday) and the full sheet (today)
// ask the same four things, and until now each owned its own copy — which had
// already drifted: "Rest day / Planned break, away, ill" in the gate versus
// "Rest / away / Planned break, travel, ill" in the sheet, plus two different
// sub-lines for 'studied' and 'not_studied'. A student who saw both read them
// as the same question asked twice, worded slightly differently, which is worse
// than either wording alone. Exactly the failure class in ENGINEERING-MEMORY
// #4/#5/#9: one business concept with two implementations.
//
// Wording below takes the better line from each copy. Anything rendering these
// four answers imports from here — never re-declare them in a component.
export const OUTCOME_OPTIONS: OutcomeOption[] = [
  { id: 'studied',     emoji: '✅', label: 'Studied',        sub: 'Finished what I planned',    asksWhy: false },
  // 'partial' asks why as well, deliberately. It is the most common honest day
  // and the most diagnostic one: someone who sat down and did not finish is
  // telling us the PLAN is wrong, which is a product signal we can act on.
  { id: 'partial',     emoji: '📚', label: 'Studied a bit',  sub: "Sat down, didn't finish",    asksWhy: true  },
  { id: 'not_studied', emoji: '⭕', label: "Didn't study",   sub: 'Today got away from me',     asksWhy: true  },
  { id: 'skipped',     emoji: '⏭', label: 'Rest / away',    sub: 'Planned break, travel, ill', asksWhy: false },
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

/**
 * The two outcomes that mean the student sat down and did work.
 *
 * Named for what it carries rather than for one consumer: when Q5 re-cuts,
 * `outcomeNeedsDuration` shares this exact set — a day with work in it is
 * exactly the day that has a length worth telling us — and two arrays with
 * identical contents is how a fifth value gets added to one and missed in
 * the other.
 */
const WORK_HAPPENED: readonly DayOutcome[] = ['studied', 'partial'];

/**
 * A3 — was this a study day?
 *
 * ONE authority, because four consumers were answering this from
 * `study_duration > 0` and all four were wrong about the same 62 rows.
 *
 * `study_duration` CANNOT answer this question. It is NOT NULL DEFAULT 0, so
 * it has no way to say "never asked" — and the check-in gate deliberately
 * writes 0 into it ("a check-in is not a study claim"). The student,
 * meanwhile, has answered directly in `day_outcome`. Asking the hours column
 * and ignoring the answer the student actually gave is how 38 students got
 * told they had 0 study days in a week they checked in for.
 *
 * The rule is a UNION and is therefore monotone: it can only ever add a study
 * day, never remove one. Production carries zero rows where a student declared
 * not_studied/skipped while hours were positive, but the union protects that
 * case anyway — a day that already counted must not stop counting because a
 * second signal disagrees. Which of the two signals is *right* is a J6-A
 * provenance question, deliberately not decided here.
 *
 * Scope (J6-A): this reads existing columns. It changes nothing about what
 * `study_duration` stores or means, and rewrites no historical value. It also
 * deliberately does NOT read study_duration_source — how to interpret the 342
 * historical NULL-provenance rows is an open founder ruling (G14 item F), and
 * this predicate must not quietly answer it.
 */
export function dayWasStudied(row: {
  day_outcome?: string | null;
  study_duration?: number | string | null;
}): boolean {
  if (isDayOutcome(row.day_outcome) && WORK_HAPPENED.includes(row.day_outcome)) return true;
  return (Number(row.study_duration) || 0) > 0;
}

/**
 * Q3 — is this row's duration a number we actually measured?
 *
 * A UNION across the two eras this column has lived through, because the
 * product must be truthful about both at once:
 *
 *   · PROVENANCE ERA (G13-A onward). The writer said outright that no duration
 *     was collected. Authoritative, and the only signal that will exist for
 *     rows where the student declared nothing.
 *
 *   · LEGACY ERA (all 342 rows in production today). No provenance was ever
 *     stamped, but the student's own answer still carries the evidence: they
 *     said work happened AND the stored duration is zero. Nobody studies for
 *     exactly no time; that pair is a question the surface never finished
 *     asking.
 *
 * WHY THE UNION AND NOT THE STAMP ALONE. Detecting this from
 * `study_duration_source === 'not_collected'` by itself is correct in a world
 * where provenance is populated and VACUOUS in ours: that column is NULL in
 * 342 of 342 production rows, so a stamp-only rule excludes exactly zero of
 * them. Measured: stamp-only 0 rows, this rule 65 rows across 40 students,
 * moving the measured average from 2.13 to 2.84 h/day. A fix that ships and
 * changes nothing is the failure mode this workstream exists to catch.
 *
 * WHAT THIS DELIBERATELY DOES NOT DECIDE. A bare NULL provenance still means
 * "we don't know where this number came from" and does NOT on its own make a
 * duration unknown — otherwise one deploy would silently reclassify every
 * historical row, which J6-A forbids. Unknown-ness here always rests on
 * POSITIVE evidence: an explicit stamp, or a declared-work-with-zero-hours
 * pair. The held ruling on bare NULL semantics is untouched.
 *
 * A DECLARED ZERO IS A MEASUREMENT. 'not_studied' and 'skipped' at zero hours
 * stay in the average deliberately — excluding them would let a student dodge
 * every flag by honestly reporting their bad days, which inverts the incentive
 * the whole check-in depends on.
 */
export function durationIsUnknown(row: {
  day_outcome?: string | null;
  study_duration?: number | string | null;
  study_duration_source?: string | null;
}): boolean {
  if (row.study_duration_source === 'not_collected') return true;
  if ((Number(row.study_duration) || 0) > 0) return false;
  return isDayOutcome(row.day_outcome) && WORK_HAPPENED.includes(row.day_outcome);
}
