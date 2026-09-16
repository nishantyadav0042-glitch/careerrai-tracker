import { fetchAll } from '@/lib/supabase/fetch-all';

// ── A DAY'S LOG COUNT IS NOT FINISHED WHEN THE DAY IS ───────────────────────
//
// Founder, 16 Sep 2026, looking at the Command Center at 09:36 IST:
// *"why these daily logs decreased so significantly suddenly?"* The tile said
// LOGGED YESTERDAY 12 where the day before had read 30.
//
// Nothing had decreased. Students fill in the previous day's log during the
// NEXT day, and measured across thirteen days only **22% of that backfill
// arrives before 10:00 IST** — 78% comes later, peaking between 19:00 and
// 21:00. Split by when the row was written:
//
//   report_date   written that day   filled in next day   final
//   10 Sep              7                  +11              19
//   11 Sep              9                  +12              21
//   12 Sep              8                  +14              23
//   13 Sep              9                  +14              23
//   14 Sep             11                  +18              30
//   15 Sep              9                  +3 (at 09:36)    12  ← read here
//
// The same-day component of 15 Sep was NINE, which is the most ordinary number
// in that column. The tile was not showing a collapse; it was showing a number
// that was roughly four-fifths unwritten, next to one that was finished.
//
// A count that keeps growing for two days will mislead every single morning,
// and no caption fixes that, because the reader compares the two numbers
// before they reach the caption. So the number says its own maturity, and the
// figure it says is MEASURED from this table's own history rather than typed
// in here, so it cannot go stale.
//
// Deliberately NOT done: re-pointing the tiles at a settled day. The count and
// the People list behind it come from the same filter (the rule this whole
// surface exists for), and `ActivityState` derives from days-since-log across
// the app. Moving the tile's day without moving that enum would break the one
// invariant that makes these numbers trustworthy.

/**
 * Days after which a day's log count stops moving.
 *
 * TWO, measured: for every report_date in the sixteen-day window, the count at
 * age 2 already equals the final count. Age 1 does not — 14 Sep was 29 at age
 * 1 and 30 at age 2.
 */
export const SETTLE_DAYS = 2;

/** How far back to read when measuring what "normal" looks like. */
export const MATURITY_WINDOW_DAYS = 12;

export interface LogRow {
  reportDate: string;    // 'YYYY-MM-DD', the study day the row is ABOUT
  createdAt: string;     // ISO, when the student actually wrote it
}

export interface LogMaturity {
  /** The most recent day whose count will not change again. */
  settledDay: string | null;
  settledCount: number | null;
  /** What a settled day typically lands at — the honest comparison figure. */
  settledMedian: number | null;
  /**
   * How complete today's and yesterday's counts typically are AT THIS HOUR,
   * as a percentage, from this table's own history. Null when the window has
   * too little to say so honestly (never a guessed 50).
   */
  todaySharePct: number | null;
  yesterdaySharePct: number | null;
}

const EMPTY: LogMaturity = {
  settledDay: null, settledCount: null, settledMedian: null,
  todaySharePct: null, yesterdaySharePct: null,
};

function istDayStr(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function startOfIstDayMs(day: string): number {
  return Date.parse(`${day}T00:00:00+05:30`);
}

function median(ns: number[]): number | null {
  if (ns.length === 0) return null;
  const s = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * How complete a day is, at the same point in its life as `elapsedMs` past its
 * start — measured across the settled days we have, and returned as a median
 * so one unusual day cannot set the expectation.
 */
function shareAtElapsed(byDay: Map<string, LogRow[]>, settled: string[], elapsedMs: number): number | null {
  const ratios: number[] = [];
  for (const day of settled) {
    const rows = byDay.get(day) ?? [];
    if (rows.length === 0) continue;
    const cutoff = startOfIstDayMs(day) + elapsedMs;
    const present = rows.filter((r) => Date.parse(r.createdAt) < cutoff).length;
    ratios.push(present / rows.length);
  }
  const m = median(ratios);
  return m == null ? null : Math.round(m * 100);
}

/** Pure core, so the arithmetic is provable without a database. */
export function computeLogMaturity(rows: readonly LogRow[], nowMs: number): LogMaturity {
  if (rows.length === 0) return EMPTY;

  const byDay = new Map<string, LogRow[]>();
  for (const r of rows) {
    if (!r.reportDate || !r.createdAt) continue;
    const list = byDay.get(r.reportDate);
    if (list) list.push(r);
    else byDay.set(r.reportDate, [r]);
  }

  const today = istDayStr(nowMs);
  const todayStart = startOfIstDayMs(today);
  const settledBefore = todayStart - (SETTLE_DAYS - 1) * 86_400_000;
  // A day is settled once SETTLE_DAYS have passed since it began.
  const settled = [...byDay.keys()]
    .filter((d) => startOfIstDayMs(d) < settledBefore)
    .sort();

  const settledDay = settled.length > 0 ? settled[settled.length - 1] : null;
  const counts = settled.map((d) => (byDay.get(d) ?? []).length);

  return {
    settledDay,
    settledCount: settledDay ? (byDay.get(settledDay) ?? []).length : null,
    settledMedian: median(counts),
    todaySharePct: shareAtElapsed(byDay, settled, nowMs - todayStart),
    yesterdaySharePct: shareAtElapsed(byDay, settled, nowMs - (todayStart - 86_400_000)),
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = { from: (t: string) => any };

/** Named rather than inlined as a generic: the population-cap guard reads the
 *  text between `fetchAll` and `.from(`, and a `;` inside an inline type
 *  parameter looks to it like a statement boundary — so an inline generic
 *  makes a correctly paged read register as an unbounded one. */
type LogReadRow = { report_date: string; created_at: string };

/**
 * Read enough history to say how finished today's and yesterday's counts are.
 *
 * Paged (Incident #65): `daily_reports` is population-scaled, and a truncated
 * read here would understate exactly the backfill this exists to measure.
 * Returns EMPTY on any failure — the tiles then print no maturity claim at
 * all, which is the honest fallback. A share we cannot measure is never
 * guessed (ENGINEERING-MEMORY L1).
 */
export async function readLogMaturity(admin: Admin, nowMs: number): Promise<LogMaturity> {
  const since = istDayStr(nowMs - MATURITY_WINDOW_DAYS * 86_400_000);
  const { data, error } = await fetchAll<LogReadRow>(
    () => admin.from('daily_reports').select('report_date, created_at').gte('report_date', since),
  );
  if (error || !data) return EMPTY;
  return computeLogMaturity(
    data.map((r) => ({ reportDate: r.report_date, createdAt: r.created_at })),
    nowMs,
  );
}
