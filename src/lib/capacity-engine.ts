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

  // NO POSITIVE EVIDENCE IS NOT EVIDENCE OF NOTHING.
  //
  // This used to read `const behaviour = typical ?? 0.5`, inventing half an
  // hour of capacity for a student we had never seen study. That invented
  // number then became their whole day: capBudget takes min(pace, sustainable),
  // so 0.5h beat a 9h requirement, and routine-engine's
  // `Math.max(30, hours * 60)` floored the plan at exactly 30 minutes.
  //
  // A student then asked why his day was 12m + 9m + 9m under a headline saying
  // "9h needed". The answer was that he had marked VARC, DILR and QA as studied
  // but skipped the OPTIONAL hours field, LoggingModal sent `hours ?? 0`, and
  // we read those zeros as proof he studies nothing. He had told us he worked;
  // we recorded that he hadn't, and then shrank his plan for it. Twenty-eight
  // such days exist across twenty students.
  //
  // So: when there is no day we can point to, fall back to what they TOLD us —
  // exactly as the `loggedDays < MIN_DAYS_FOR_BEHAVIOUR` branch above already
  // does. The two branches now agree: absent evidence, trust the claim. We only
  // plan below someone's claim when we can name the days that justify it.
  if (typical == null) {
    return {
      claimedHours, loggedDays, typicalStudyHours: null, sustainableHours: claimedHours, trust: 'input',
      note: `No day with hours recorded yet — trusting the ${claimedHours ?? '?'}h entered rather than assuming zero.`,
    };
  }

  // Believe the LOWER of claim and behaviour; never plan above what they said.
  const behaviour = typical;
  const sustainable = claimedHours != null ? round2(Math.min(claimedHours, behaviour)) : round2(behaviour);
  const trust: Capacity['trust'] = claimedHours != null && behaviour < claimedHours - 0.5 ? 'behaviour' : 'input';

  return {
    claimedHours, loggedDays, typicalStudyHours: typical, sustainableHours: sustainable, trust,
    note: trust === 'behaviour'
      ? `Studies ~${typical}h on active days (entered ${claimedHours}h). Plan sized to ${sustainable}h so it's completable — behaviour, not the claim.`
      : `Behaviour matches the ${claimedHours}h entered.`,
  };
}

// Cap a proposed daily budget at what the student can actually sustain. Only
// trims down; a null/absent capacity leaves the budget untouched.
export type PlanSizing = 'adaptive' | 'full';

/**
 * `sizing` is the student's own override, and it only ever appears because they
 * asked for it (Home pace card → "Use my full plan"). 'full' skips the
 * behavioural cap entirely and plans to whatever the pace requires.
 *
 * The cap is right by default and wrong as an absolute: someone who studied 2h
 * a day through exam week, then clears their calendar, should not be told for a
 * fortnight that they are a 2h person. Our memory of them must not become their
 * ceiling. Defaults to 'adaptive', so every existing caller is unchanged.
 */
export function capBudget(
  proposedHours: number | null,
  capacity: Capacity,
  sizing: PlanSizing = 'adaptive',
): number | null {
  if (sizing === 'full') return proposedHours;
  if (capacity.sustainableHours == null) return proposedHours;
  if (proposedHours == null) return capacity.sustainableHours;
  return Math.min(proposedHours, capacity.sustainableHours);
}
