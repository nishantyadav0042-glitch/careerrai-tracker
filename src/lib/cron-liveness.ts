/* eslint-disable @typescript-eslint/no-explicit-any */

// ── IS THE SCHEDULE ACTUALLY RUNNING? ───────────────────────────────────────
//
// Three times in two days the answer to "does this job run?" was assumed from
// the fact that it was declared, and twice the assumption was wrong:
//
//   · outcome-sweep (#55)            declared 24 Aug, never executed. The half
//                                    of the learning loop that observes what a
//                                    student did after an intervention.
//   · purge-session-handoffs (#56)   declared 27 Aug, never executed. 595 rows
//                                    still holding Supabase credential pairs.
//
// Both were found by hand, by someone thinking to ask. Neither would ever have
// raised an alarm, because the failure mode is SILENCE: a job that has never
// run looks exactly like a job whose work has not come due, and a table that is
// never swept looks exactly like a table with nothing to sweep.
//
// Founder, 29 Aug 2026, on how this experiment could produce a false positive:
// "a scheduled automation silently stops running." This is that check. It
// matters most for the learning loop — if the sweep dies mid-experiment,
// evidence stops accruing and the first sign is an empty ledger on day 30.
//
// DEAD, NOT LATE. The thresholds are deliberately generous multiples of each
// schedule's period. A cron that slipped an hour is not an incident; a daily
// cron that has been quiet for a day and a half has stopped.

export interface CronRunSummary {
  /** Path as recorded in cron_runs.cron_path. */
  path: string;
  /** ISO of the most recent run, or null if it has NEVER run. */
  lastRunIso: string | null;
}

export interface SilentCron {
  path: string;
  schedule: string;
  /** Null means it has never run at all — the worse case of the two. */
  lastRunIso: string | null;
  hoursSilent: number | null;
  limitHours: number;
}

/**
 * How long a schedule may plausibly stay quiet before it is presumed dead.
 *
 * Classified by shape rather than parsed precisely: we are separating "stopped"
 * from "running", not predicting the next fire time, and a wrong answer here
 * costs a false alarm rather than a missed one.
 */
export function maxSilentHours(schedule: string): number {
  const parts = schedule.trim().split(/\s+/);
  const [min, hour, , , dow] = parts;
  // Weekly: a fixed day-of-week.
  if (dow !== undefined && dow !== '*' && !dow.includes('*')) return 9 * 24;
  // Sub-hourly (*/15, or a minute list) and hourly (minute fixed, hour '*').
  if (hour === '*') {
    if (min.includes('/') || min.includes(',')) return 3;
    return 3;
  }
  // Every-N-hours.
  if (hour.includes('/')) return 12;
  // Daily at a fixed time.
  return 36;
}

/**
 * Which declared jobs have gone quiet.
 *
 * Pure: the caller supplies what the database said, so the rule is testable
 * without a clock or a connection. `runs` need only contain paths that have
 * run at least once — anything declared and absent is reported as never-run.
 */
export function findSilentCrons(
  declared: readonly { path: string; schedule: string }[],
  runs: readonly CronRunSummary[],
  nowMs: number,
): SilentCron[] {
  // Normalise BOTH sides to the bare route. cron_runs records the path exactly
  // as the scheduler called it, INCLUDING the query string — production holds
  // '/api/cron/study-companion?slot=kickoff' — so matching a declared
  // '...?slot=spark' against those keys by raw string would miss every time and
  // report a perfectly healthy route as never-run. Found by running this
  // against the real table rather than trusting the fixtures.
  const lastByPath = new Map<string, string | null>();
  for (const r of runs) {
    const base = r.path.split('?')[0];
    const prev = lastByPath.get(base);
    if (!prev || (r.lastRunIso !== null && r.lastRunIso > prev)) lastByPath.set(base, r.lastRunIso);
  }

  // Keyed by ROUTE, not by declared entry: study-companion is declared four
  // times with different ?slot= values but is one deployment that is either
  // alive or not. Reporting it four times in a 3am alert is noise that makes
  // the real list harder to read.
  const out = new Map<string, SilentCron>();
  for (const d of declared) {
    const limitHours = maxSilentHours(d.schedule);
    // cron_runs records the path without any query string, so a job declared as
    // `/api/cron/x?slot=y` is matched on its route. Several slots share one
    // path; any of them running proves the route is alive.
    const base = d.path.split('?')[0];
    const last = lastByPath.has(base) ? lastByPath.get(base)! : null;

    const record = (entry: SilentCron) => {
      const prev = out.get(base);
      // Keep the tightest threshold seen for the route, so a slot that should
      // have run recently is not masked by a laxer sibling.
      if (!prev || entry.limitHours < prev.limitHours) out.set(base, entry);
    };

    if (last === null) {
      record({ path: base, schedule: d.schedule, lastRunIso: null, hoursSilent: null, limitHours });
      continue;
    }
    const hoursSilent = (nowMs - Date.parse(last)) / 3_600_000;
    if (hoursSilent > limitHours) {
      record({ path: base, schedule: d.schedule, lastRunIso: last, hoursSilent: Math.round(hoursSilent), limitHours });
    }
  }
  // Never-run first: a job that has never executed is a deployment that never
  // took effect, which is a different and worse problem than one that stopped.
  return [...out.values()].sort((a, b) =>
    (a.lastRunIso === null ? 0 : 1) - (b.lastRunIso === null ? 0 : 1)
    || a.path.localeCompare(b.path));
}

/** One line per dead job, for an alert a human reads at 3am. */
export function describeSilentCrons(silent: readonly SilentCron[]): string {
  return silent.map((s) => s.lastRunIso === null
    ? `NEVER RUN — ${s.path} (${s.schedule}). Declared but has never executed once.`
    : `SILENT ${s.hoursSilent}h — ${s.path} (${s.schedule}), limit ${s.limitHours}h, last ran ${s.lastRunIso}.`
  ).join('\n');
}
