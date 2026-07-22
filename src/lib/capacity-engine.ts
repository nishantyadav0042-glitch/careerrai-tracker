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
    note: trust === 'behaviour'
      ? `Studies ~${typical}h on active days (entered ${claimedHours}h). Plan sized to ${sustainable}h so it's completable — behaviour, not the claim.`
      : `Behaviour matches the ${claimedHours}h entered.`,
  };
}

// Cap a proposed daily budget at what the student can actually sustain. Only
// trims down; a null/absent capacity leaves the budget untouched.
export function capBudget(proposedHours: number | null, capacity: Capacity): number | null {
  if (capacity.sustainableHours == null) return proposedHours;
  if (proposedHours == null) return capacity.sustainableHours;
  return Math.min(proposedHours, capacity.sustainableHours);
}
