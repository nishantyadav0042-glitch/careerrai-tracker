// ── What CareerRai actually added ───────────────────────────────────────────
//
// Founder, 13 Aug: "why repeating 8 hours again and again — instead pitch
// CareerRai in a smart manner: with CareerRai you have added 1 hour to your
// CAT prep, then with the streak the hours increase, and also for free."
//
// He is right about the symptom. The card said "8h today" in the streak row
// and "8h a day — you're ahead" in the headline: the same number twice, and
// the chip beside them already said "Date is safe", which is what the second
// half of that headline meant. Three statements, one fact.
//
// The interesting question is what replaces it WITHOUT inventing anything.
// "CareerRai added 1 hour" is a counterfactual — it claims to know what the
// student would have done in a world without us, and we cannot know that.
// TRUST-OS: never a number we cannot show the working for.
//
// What we CAN show is a before-and-after inside their own record: the rate
// they were studying at when they arrived, and the rate they are studying at
// now. Both are their own logged hours. The gap between them is real, it is
// theirs, and it happens to grow exactly the way the founder wants it to —
// because a streak is what makes it grow.
//
// Two deliberate conservatisms, because the number goes on the home screen:
//
//  1. CALENDAR days, not logged days. A skipped day counts as zero, not as
//     absent. Averaging over logged days only would hand a huge "gain" to a
//     student who logged one heavy day this week and nothing else — the
//     opposite of the truth.
//
//  2. The extra-hours total is MEASURED, not extrapolated. It is the hours
//     actually logged since the baseline window minus what their starting
//     rate would have produced over the same stretch. No projecting today's
//     rate backwards over weeks that did not go that way.
//
// Below the density gate we make no claim at all and simply show the hours
// banked, which needs no counterfactual to be true.

export interface LoggedDay {
  report_date: string;
  study_duration: number | string | null;
}

export type PrepGain =
  /** Enough history for an honest before/after, and it moved up. */
  | { kind: 'gain'; perDay: number; extraHours: number; banked: number; daysLogged: number }
  /** Hours are real; a trend claim is not yet earned. */
  | { kind: 'banked'; banked: number; daysLogged: number }
  /** Nothing logged — there is no number, so there is no line. */
  | { kind: 'none' };

/** Their arrival rate is read off their first days here. */
export const BASELINE_DAYS = 3;
/** Their rate now. A week, so one heavy Sunday cannot carry it. */
export const RECENT_DAYS = 7;
/**
 * Total calendar days on record before a trend may be claimed. The two
 * windows total 10; the extra days keep them from touching, so "then" and
 * "now" are genuinely different stretches of time.
 */
export const MIN_DAYS_FOR_GAIN = 14;
/** Under half an hour a day is drift, not a change worth a headline. */
export const MIN_GAIN_PER_DAY = 0.5;
/** And the cumulative figure has to round to something real. */
export const MIN_EXTRA_HOURS = 1;

const DAY_MS = 86_400_000;

function toDate(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

function hoursOf(row: LoggedDay): number {
  const n = Number(row.study_duration);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Their own before-and-after, from logs already on the page.
 *
 * `logs` may arrive in any order and may contain days with zero hours.
 * `today` is the student's local day, passed in rather than read from the
 * clock so the server and a test agree on where the recent window ends.
 */
export function computePrepGain(logs: readonly LoggedDay[], today: string): PrepGain {
  const rows = logs.filter((l) => typeof l.report_date === 'string' && l.report_date <= today);
  if (rows.length === 0) return { kind: 'none' };

  const banked = Math.round(rows.reduce((sum, r) => sum + hoursOf(r), 0));
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.report_date, (byDate.get(r.report_date) ?? 0) + hoursOf(r));

  const dates = [...byDate.keys()].sort();
  const firstIso = dates[0];
  const todayMs = toDate(today);
  const firstMs = toDate(firstIso);
  // Inclusive of both ends: a student who logged only today has 1 day on record.
  const daysLogged = Math.floor((todayMs - firstMs) / DAY_MS) + 1;

  if (banked <= 0) return { kind: 'none' };
  if (daysLogged < MIN_DAYS_FOR_GAIN) return { kind: 'banked', banked, daysLogged };

  const sumBetween = (startMs: number, endMs: number): number => {
    let total = 0;
    for (const [iso, h] of byDate) {
      const t = toDate(iso);
      if (t >= startMs && t < endMs) total += h;
    }
    return total;
  };

  const baselineEndMs = firstMs + BASELINE_DAYS * DAY_MS;
  const baselineRate = sumBetween(firstMs, baselineEndMs) / BASELINE_DAYS;

  const recentStartMs = todayMs - (RECENT_DAYS - 1) * DAY_MS;
  const recentRate = sumBetween(recentStartMs, todayMs + DAY_MS) / RECENT_DAYS;

  const perDay = Math.round((recentRate - baselineRate) * 10) / 10;

  // Measured, never projected: what they actually logged after the baseline
  // window, less what their arrival rate would have produced over the same
  // number of days.
  const daysSinceBaseline = Math.round((todayMs + DAY_MS - baselineEndMs) / DAY_MS);
  const loggedSinceBaseline = sumBetween(baselineEndMs, todayMs + DAY_MS);
  const extraHours = Math.round(loggedSinceBaseline - baselineRate * daysSinceBaseline);

  if (perDay < MIN_GAIN_PER_DAY || extraHours < MIN_EXTRA_HOURS) {
    return { kind: 'banked', banked, daysLogged };
  }
  return { kind: 'gain', perDay, extraHours, banked, daysLogged };
}
