// The study report — the four numbers a student asked us for, by name.
//
// Vedprakash (18 logged days, 41 hours — the most engaged student on the
// product), 1 Aug: "can we have a page on dashboard where we can see our study
// report.. how much we studied per day.. any graph… also avg weekly study
// ratio.. topics finished". He could not find one, because it was folded into
// Profile → History as a plain list and the two computed numbers he wanted did
// not exist anywhere.
//
// THE DISTINCTION THIS FILE IS BUILT ON. A list of what you logged is your own
// input read back to you — you already know it, so it earns nothing. A weekly
// average, a direction, and a concentration split are things a student cannot
// work out in their head. That difference is the whole reason to open an app
// you already gave the data to.
//
// Pure and dependency-free: every number below is derived from rows the caller
// passes in, so each one is testable without a database and identical every
// run. No clock reads inside — `today` is always an argument, because a
// function that reads the clock cannot be tested across a week boundary.

export interface StudyLogRow {
  /** ISO date, 'YYYY-MM-DD'. */
  report_date: string;
  /** Hours. Null and 0 are both real: a logged day with no study is a signal, not a gap. */
  study_duration: number | null;
  /** What was studied. Today these are section names ('QA', 'DILR'), not topics. */
  topics_covered: string[] | null;
}

export interface DayBar { date: string; hours: number; logged: boolean }

/**
 * One bar per day for the last `days` days, oldest first, INCLUDING days with
 * no log at all.
 *
 * Zero-filling is the point. A chart of only logged days draws a comforting
 * unbroken line through a fortnight where someone studied twice — the gaps are
 * the honest part, and they are what a student needs to see. `logged`
 * distinguishes "logged 0 hours" from "never opened the app", which are
 * different problems and must not render identically.
 */
export function dailyBars(rows: StudyLogRow[], today: string, days = 14): DayBar[] {
  const byDate = new Map<string, StudyLogRow>();
  for (const r of rows) byDate.set(r.report_date, r);

  const end = new Date(`${today}T00:00:00Z`);
  const out: DayBar[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key);
    out.push({ date: key, hours: Math.max(0, row?.study_duration ?? 0), logged: row != null });
  }
  return out;
}

export interface WeeklyAverage {
  thisWeek: number;
  lastWeek: number;
  /** Percent change, null when last week is 0 — a rise from nothing has no percentage. */
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat' | 'new';
}

/**
 * Hours in the last 7 days vs the 7 before that.
 *
 * Rolling windows, not calendar weeks. A student opening this on Tuesday should
 * not see a "week" two days long and conclude they have collapsed.
 */
export function weeklyAverage(rows: StudyLogRow[], today: string): WeeklyAverage {
  const end = new Date(`${today}T00:00:00Z`).getTime();
  const DAY = 86_400_000;
  const sumBetween = (fromDaysAgo: number, toDaysAgo: number) =>
    rows.reduce((acc, r) => {
      const t = new Date(`${r.report_date}T00:00:00Z`).getTime();
      const ago = Math.round((end - t) / DAY);
      return ago >= toDaysAgo && ago < fromDaysAgo ? acc + Math.max(0, r.study_duration ?? 0) : acc;
    }, 0);

  const thisWeek = round1(sumBetween(7, 0));
  const lastWeek = round1(sumBetween(14, 7));

  if (lastWeek === 0) {
    return { thisWeek, lastWeek, deltaPct: null, direction: thisWeek > 0 ? 'new' : 'flat' };
  }
  const deltaPct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  return {
    thisWeek,
    lastWeek,
    deltaPct,
    // A ±5% wobble is noise. Calling it "up" every week it drifts is how a
    // number stops being believed.
    direction: deltaPct > 5 ? 'up' : deltaPct < -5 ? 'down' : 'flat',
  };
}

export interface Consistency { daysLogged: number; daysElapsed: number; pct: number }

/**
 * How many of the days since their FIRST log they actually logged.
 *
 * Anchored to the first log rather than signup, so a student who lurked for
 * three weeks before starting is not permanently punished by a denominator
 * they cannot change.
 */
export function consistency(rows: StudyLogRow[], today: string): Consistency {
  if (rows.length === 0) return { daysLogged: 0, daysElapsed: 0, pct: 0 };
  const dates = rows.map((r) => r.report_date).sort();
  const first = new Date(`${dates[0]}T00:00:00Z`).getTime();
  const end = new Date(`${today}T00:00:00Z`).getTime();
  const daysElapsed = Math.max(1, Math.round((end - first) / 86_400_000) + 1);
  const daysLogged = new Set(dates).size;
  return { daysLogged, daysElapsed, pct: Math.round((daysLogged / daysElapsed) * 100) };
}

export interface SplitRow { label: string; hours: number; pct: number; days: number }

/**
 * Where the hours actually went.
 *
 * This is the number nobody can compute in their head, and the one that changed
 * the conversation: 14 of Vedprakash's 18 logged days were DILR. He could not
 * have known that, and it is the single most useful thing his own log contains.
 *
 * Hours are split EVENLY across whatever a day names. A day logging "QA, VARC"
 * for 2 hours contributes 1 hour each — we do not know the real division, and
 * inventing a weighting would be a number dressed as a measurement.
 */
export function sectionSplit(rows: StudyLogRow[]): SplitRow[] {
  const hours = new Map<string, number>();
  const days = new Map<string, number>();

  for (const r of rows) {
    const labels = (r.topics_covered ?? []).filter((t) => typeof t === 'string' && t.trim());
    if (labels.length === 0) continue;
    const share = Math.max(0, r.study_duration ?? 0) / labels.length;
    for (const l of labels) {
      hours.set(l, (hours.get(l) ?? 0) + share);
      days.set(l, (days.get(l) ?? 0) + 1);
    }
  }

  const total = [...hours.values()].reduce((a, b) => a + b, 0);
  return [...hours.entries()]
    .map(([label, h]) => ({
      label,
      hours: round1(h),
      // When every logged day has 0 hours, fall back to share of DAYS so the
      // split still says something true instead of rendering all zeros.
      pct: total > 0 ? Math.round((h / total) * 100) : 0,
      days: days.get(label) ?? 0,
    }))
    .sort((a, b) => b.hours - a.hours || b.days - a.days);
}

/**
 * The one line worth putting at the top — concentration, when it is lopsided.
 *
 * Returns null rather than inventing something when the split is balanced or
 * the sample is too thin. A report that always has a headline is a report whose
 * headline nobody reads.
 */
export function concentrationLine(split: SplitRow[], totalLoggedDays: number): string | null {
  if (totalLoggedDays < 5 || split.length < 2) return null;
  const top = split[0];
  if (top.days / totalLoggedDays < 0.6) return null;
  const others = split.slice(1).reduce((a, s) => a + s.days, 0);
  return `${top.days} of your ${totalLoggedDays} logged days were ${top.label}. Everything else got ${others}.`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
