// Capacity Engine (LIS Layer 3) — "believe behaviour, not onboarding input."
//
// A student who entered 6h but has logged ~2.8h for weeks HAS a 2.8h capacity.
// The plan must be sized to what they can actually sustain, not what they
// claimed — otherwise every day starts as a failure (the Pranav trap). This is
// deterministic and explainable: no model, just the student's own logged hours.
//
// It only overrides the claimed number once there's enough behaviour to trust
// (a new student is given the benefit of their stated hours). It only ever
// trims the plan down toward reality — never inflates it.

export interface Capacity {
  claimedHours: number | null;      // what they entered (study_target_hours)
  loggedDays: number;               // days with a report in the window
  typicalStudyHours: number | null; // median hours on days they actually studied
  sustainableHours: number | null;  // the daily budget the plan should use
  trust: 'input' | 'behaviour';     // which we believe right now
  note: string;                     // human explanation (admin/coach + future student copy)
}

export const CAPACITY_WINDOW_DAYS = 21;
const MIN_DAYS_FOR_BEHAVIOUR = 5;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const round2 = (n: number) => Math.round(n * 2) / 2;

// Pure and testable. `recentStudyHours` = study_duration for each logged day in
// the window (honest 0-hour days included as 0). `loggedDays` = how many days
// had a report at all.
export function computeCapacity(recentStudyHours: number[], loggedDays: number, claimedHours: number | null): Capacity {
  const productive = recentStudyHours.filter((h) => h > 0);
  const typicalRaw = productive.length >= 3 ? median(productive) : productive.length ? productive.reduce((a, b) => a + b, 0) / productive.length : 0;
  const typical = typicalRaw > 0 ? Math.max(0.5, round2(typicalRaw)) : null;

  // Not enough behaviour yet — trust what they told us.
  if (loggedDays < MIN_DAYS_FOR_BEHAVIOUR) {
    return {
      claimedHours, loggedDays, typicalStudyHours: typical, sustainableHours: claimedHours, trust: 'input',
      note: `Too early to judge (only ${loggedDays} logged ${loggedDays === 1 ? 'day' : 'days'}) — trusting the ${claimedHours ?? '?'}h entered.`,
    };
  }

  // Believe the LOWER of claim and behaviour; never plan above what they said.
  const behaviour = typical ?? 0.5;
  const sustainable = claimedHours != null ? round2(Math.min(claimedHours, behaviour)) : round2(behaviour);
  const trust: Capacity['trust'] = claimedHours != null && behaviour < claimedHours - 0.5 ? 'behaviour' : 'input';

  return {
    claimedHours, loggedDays, typicalStudyHours: typical, sustainableHours: sustainable, trust,
    // TWO fixes in one string, because they were one string.
    //
    // 1. It repeated the sizing claim the admin badge was removed for. Nothing
    //    applies sustainableHours to a plan -- capBudget() has no caller, and
    //    the day is sized by dailyHours(profile). Taking the badge out while
    //    leaving the sentence underneath it would have moved the falsehood, not
    //    removed it. What survives is the OBSERVATION, which is true.
    //
    // 2. It interpolated TWO nullable values unguarded. `typical` is the median
    //    of productive days and is null when that set is empty; `claimedHours`
    //    is nullable too. Either rendered a literal "nullh" at the founder. The
    //    adjacent too-early branch already used the `?? '?'` guard, so the file
    //    had the pattern -- two interpolations in one expression simply never
    //    received it.
    note: trust === 'behaviour'
      ? `Studies ~${typical ?? '?'}h on active days (entered ${claimedHours ?? '?'}h) — believe the behaviour, not the claim.`
      : `Behaviour matches the ${claimedHours ?? '?'}h entered.`,
  };
}

// Cap a proposed daily budget at what the student can actually sustain. Only
// trims down; a null/absent capacity leaves the budget untouched.
export function capBudget(proposedHours: number | null, capacity: Capacity): number | null {
  if (capacity.sustainableHours == null) return proposedHours;
  if (proposedHours == null) return capacity.sustainableHours;
  return Math.min(proposedHours, capacity.sustainableHours);
}

// ── THE GAP BETWEEN WHAT A STUDENT SAYS AND WHAT THEY DO ────────────────────
//
// Measured 16 Sep 2026 across the 804 students who have ever been given a
// routine: median claimed 5h/day, p90 8h, max 16h. Median study actually
// reported by an active student: 0.6h. Thirty-six minutes.
//
// The plan is NOT over-reaching. It is faithfully building the day the student
// asked for — and 413 of those 804 carry `study_hours_source = 'student'`,
// meaning they personally confirmed that number. The product then never
// mentions the gap again, and regenerates a five-hour day every morning while
// 83.7% of routines never receive a single tick.
//
// WHY THIS DOES NOT SIMPLY TRIM THE NUMBER. daily-hours.ts carries a standing
// founder decision (6 Aug): the hours are the STUDENT'S, and "nothing in this
// codebase may derive, cap, trim, round toward behaviour, or otherwise
// 'improve' it… The date gives. The hours don't." That rule is right, and it
// is right for this exact case: 15 hours from a sincere student is a real
// answer, and an app that quietly rewrites it to 0.6 has an opinion about a
// number it was only ever asked to hold.
//
// So nothing here writes anything. This computes an OBSERVATION and a
// PROPOSAL. The student is shown the gap in their own numbers and taps to
// change it or to keep it, and `setDailyHours(…, 'student')` remains the only
// writer. One number, one owner — the owner just finally gets to see the
// evidence.
//
// It is deliberately symmetric. A student doing three hours against a claimed
// one is offered the increase, because a capacity signal that can only ever
// revise downward is a permanent label, not a planning input.

import { MIN_DAILY_HOURS, MAX_DAILY_HOURS } from '@/lib/daily-hours';

/** Claim must be at least this multiple of behaviour before we say anything. */
export const OVERSTATE_RATIO = 2;
/** …and the absolute gap must be at least this many hours. Both, not either. */
export const MIN_GAP_HOURS = 1;
/** Days since the student last set their hours before we may raise it again. */
export const OFFER_COOLDOWN_DAYS = 14;

export interface HoursReality {
  /** False when there is too little behaviour to claim anything. */
  established: boolean;
  claimedHours: number | null;
  /** Typical hours on a day they actually studied. Median, so one 9-hour
   *  Sunday cannot redefine a student. */
  observedHours: number | null;
  loggedDays: number;
  /** claimed ÷ observed. Above 1 means they ask more of themselves than they do. */
  ratio: number | null;
  direction: 'over' | 'under' | 'matched' | null;
  /** What we would propose instead. NEVER applied — only ever shown. */
  suggestedHours: number | null;
}

const clampHours = (h: number) =>
  Math.min(MAX_DAILY_HOURS, Math.max(MIN_DAILY_HOURS, Math.round(h * 2) / 2));

/**
 * Read the gap out of a Capacity. Pure, and it decides nothing.
 *
 * `established` is the honest gate: below MIN_DAYS_FOR_BEHAVIOUR logged days
 * we do not know this student yet, and telling a three-day-old account that it
 * over-claims would be punishing them for having no history — which is the
 * one thing the founder ruled out by name.
 */
export function readHoursReality(c: Capacity): HoursReality {
  const observed = c.typicalStudyHours;
  const claimed = c.claimedHours;
  const established = c.loggedDays >= MIN_DAYS_FOR_BEHAVIOUR && observed != null && claimed != null;

  if (!established || observed == null || claimed == null || observed <= 0) {
    return {
      established: false, claimedHours: claimed, observedHours: observed,
      loggedDays: c.loggedDays, ratio: null, direction: null, suggestedHours: null,
    };
  }

  const ratio = claimed / observed;
  const gap = Math.abs(claimed - observed);

  let direction: HoursReality['direction'] = 'matched';
  if (ratio >= OVERSTATE_RATIO && gap >= MIN_GAP_HOURS) direction = 'over';
  else if (ratio <= 1 / OVERSTATE_RATIO && gap >= MIN_GAP_HOURS) direction = 'under';

  return {
    established: true, claimedHours: claimed, observedHours: observed,
    loggedDays: c.loggedDays, ratio, direction,
    // The student's own typical day, to the nearest half hour. Not a formula,
    // not a discount — the number their behaviour already reports. We do not
    // invent a stretch factor on top: that would be precision the data does
    // not support, dressed as encouragement.
    suggestedHours: direction === 'matched' ? null : clampHours(observed),
  };
}

/**
 * May we put the gap in front of this student right now?
 *
 * Separate from reading it, because "is this true" and "is this the moment to
 * say it" are different questions and collapsing them is how a product starts
 * nagging. A student who set their hours three days ago has answered; asking
 * again is not adaptation, it is pestering someone who already decided.
 */
export function shouldOfferHoursCorrection(
  reality: HoursReality,
  opts: { hoursSetAt?: string | null; dismissedAt?: string | null; now?: Date } = {},
): boolean {
  if (!reality.established || reality.direction === 'matched' || reality.direction == null) return false;
  if (reality.suggestedHours == null || reality.suggestedHours === reality.claimedHours) return false;

  const now = opts.now ?? new Date();
  const cooled = (iso: string | null | undefined) => {
    if (!iso) return true;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return true;
    return now.getTime() - t >= OFFER_COOLDOWN_DAYS * 86_400_000;
  };
  return cooled(opts.hoursSetAt) && cooled(opts.dismissedAt);
}
