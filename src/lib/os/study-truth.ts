import { fetchAll } from '@/lib/supabase/fetch-all';

// ── WHAT "DAILY LOGS WENT UP" ACTUALLY MEANT ────────────────────────────────
//
// Founder, 15 Sep 2026: "I don't trust these numbers. Analyse again and think
// again why daily log numbers increased."
//
// He was right not to trust them. Weekly log rows ran 81 → 140 → 124 → 170,
// which reads like the product working. Three things were hiding inside it,
// and this module exists so none of them can hide again.
//
// ══ 1. A LOG IS NOT A STUDY SESSION ═════════════════════════════════════════
//
// `daily_reports` rows where study_duration = 0 — the student recording that
// they did NOT study — are roughly HALF of every week:
//
//   week      log rows   studied >0h   zero hours
//   17 Aug      140          84            56
//   24 Aug      124          62            62
//   31 Aug      170          79            91      ← the "best" week
//   07 Sep      150          85            65
//
// The peak week was 54% people saying they had not studied. A zero-hour row is
// a good thing to collect and a terrible thing to count as studying, so the
// headline number here is STUDENTS WHO STUDIED, never rows.
//
// ══ 2. TWO DIFFERENT ACTIONS BOTH WRITE A LOG ROW ═══════════════════════════
//
// Ticking a task on the plan writes a daily_reports row with a credited
// duration (api/routine/complete-task → upsert_log_and_streak), the same table
// the daily-log form writes. Task ticks went from 26-48 a week in July to
// 187-211 from mid-August. So "logs" silently counts two different student
// actions with very different effort, and a product change to either one moves
// the number without anyone studying more.
//
// ══ 3. THE RISE WAS VOLUME, NOT BEHAVIOUR ═══════════════════════════════════
//
// Signups over the same weeks: 169, 324, 218, 164, 78 — then 2, with the ads
// off. Logs tracked them one week behind. Per SIGNUP COHORT, first-week
// behaviour barely moved, and "actually studied in week one" is still below
// the 20 July cohort:
//
//   cohort   signups   logged wk1   studied wk1   habit (3+ days in 21)
//   20 Jul     120       29.2%        20.8%              6.7%
//   10 Aug     169       22.5%        10.7%              3.0%
//   17 Aug     324       18.2%        13.3%              5.2%
//   24 Aug     218       17.9%        14.7%              6.0%
//   31 Aug     164       25.0%        17.7%              7.3%
//
// The one number genuinely improving is habit: 3.0% → 7.3%. Small, real, and
// invisible underneath a headline that was mostly ad spend.

/** A student is "mature" past this age — old enough that an arrival spike
 *  cannot be what is moving the number. */
export const MATURE_AFTER_DAYS = 7;

/** Distinct days of logging that count as a habit forming. */
export const HABIT_MIN_DAYS = 3;

/** The window a cohort is judged over. */
export const HABIT_WINDOW_DAYS = 21;

export interface StudyWeek {
  /** Students with at least one log recording REAL study time. The headline. */
  studied: number;
  /** Of those, students older than MATURE_AFTER_DAYS. */
  matureStudied: number;
  /** Rows written, both paths, both outcomes. Context only — never the headline. */
  logRows: number;
  /** Rows where the student recorded no study at all. */
  zeroHourRows: number;
}

export interface StudyTruth {
  thisWeek: StudyWeek;
  lastWeek: StudyWeek;
  /**
   * Habit rate of the most recent cohort whose 21-day window has CLOSED.
   * null when no cohort qualifies.
   *
   * A cohort mid-window always looks worse than a finished one, and quoting
   * the two side by side is the single easiest way to invent a trend. So an
   * open cohort is not reported at all rather than reported with an asterisk
   * nobody reads.
   */
  habit: { cohortWeek: string; signups: number; ratePct: number } | null;
}

/** Plain-language line for the digest. Leads with people, never with rows. */
export function studyHeadline(t: StudyTruth): string {
  const now = t.thisWeek.studied;
  const was = t.lastWeek.studied;
  const dir = now > was ? 'up from' : now < was ? 'down from' : 'level with';
  const mature = `${t.thisWeek.matureStudied} of them past their first week`;
  const habit = t.habit
    ? ` Habit rate, last complete cohort (${t.habit.cohortWeek}): ${t.habit.ratePct}%.`
    : '';
  return `${now} students actually studied this week, ${dir} ${was}. ${mature}.${habit}`;
}

/**
 * The caveat that travels WITH the number, every time.
 *
 * Without it "logs" gets quoted as studying in the next conversation, which is
 * exactly what happened for a month.
 */
export function studyCaveat(t: StudyTruth): string | null {
  const { logRows, zeroHourRows } = t.thisWeek;
  if (logRows === 0) return null;
  const pct = Math.round((zeroHourRows / logRows) * 100);
  return `${logRows} log rows were written, but ${pct}% of them recorded no study time. `
    + `Count students who studied, not logs.`;
}

type Admin = { from: (t: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any

interface ReportRow { student_id: string; report_date: string; study_duration: number | null }

function weekOf(rows: ReportRow[], ageOf: Map<string, number>): StudyWeek {
  const studied = new Set<string>();
  const mature = new Set<string>();
  let zero = 0;
  for (const r of rows) {
    const hours = Number(r.study_duration ?? 0);
    if (hours > 0) {
      studied.add(r.student_id);
      if ((ageOf.get(r.student_id) ?? 0) > MATURE_AFTER_DAYS) mature.add(r.student_id);
    } else {
      zero += 1;
    }
  }
  return { studied: studied.size, matureStudied: mature.size, logRows: rows.length, zeroHourRows: zero };
}

/**
 * Read the honest weekly picture.
 *
 * Paged (Incident #65): `daily_reports` and `profiles` are population-scaled.
 * On a read failure this returns zeros rather than throwing — a digest that
 * fails to send teaches the founder to ignore the digest.
 */
export async function readStudyTruth(admin: Admin, nowMs: number): Promise<StudyTruth> {
  const empty: StudyWeek = { studied: 0, matureStudied: 0, logRows: 0, zeroHourRows: 0 };
  const day = (msAgo: number) => new Date(nowMs - msAgo).toISOString().slice(0, 10);
  const since14 = day(14 * 86_400_000);
  const weekCut = day(7 * 86_400_000);

  const { data: rows, error } = await fetchAll<ReportRow>(
    () => admin.from('daily_reports').select('student_id, report_date, study_duration')
      .gte('report_date', since14),
    { orderBy: 'student_id' },
  );
  if (error || !rows) return { thisWeek: empty, lastWeek: empty, habit: null };

  const ids = [...new Set(rows.map((r) => r.student_id))];
  const ageOf = new Map<string, number>();
  if (ids.length) {
    const { data: people } = await fetchAll<{ id: string; created_at: string }>(
      () => admin.from('profiles').select('id, created_at').in('id', ids),
      { orderBy: 'id' },
    );
    for (const p of people ?? []) {
      ageOf.set(p.id, Math.floor((nowMs - Date.parse(p.created_at)) / 86_400_000));
    }
  }

  return {
    thisWeek: weekOf(rows.filter((r) => r.report_date >= weekCut), ageOf),
    lastWeek: weekOf(rows.filter((r) => r.report_date < weekCut), ageOf),
    habit: await readLastCompleteCohort(admin, nowMs),
  };
}

/**
 * The most recent signup week whose 21-day window has fully closed.
 *
 * Deliberately one cohort, not a series: a trend line built from windows of
 * different lengths is a lie with a shape, and the newest cohort is always the
 * one someone wants to quote.
 */
async function readLastCompleteCohort(
  admin: Admin, nowMs: number,
): Promise<StudyTruth['habit']> {
  const closedBefore = nowMs - HABIT_WINDOW_DAYS * 86_400_000;
  // The Monday of the last week that had 21 clear days.
  const d = new Date(closedBefore);
  const dow = (d.getUTCDay() + 6) % 7;                 // Mon = 0
  const weekStart = new Date(d.getTime() - dow * 86_400_000);
  const startIso = weekStart.toISOString().slice(0, 10);
  const endIso = new Date(weekStart.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  const { data: cohort, error } = await fetchAll<{ id: string }>(
    () => admin.from('profiles').select('id')
      .eq('role', 'student')
      .not('is_test_account', 'is', true).not('is_demo', 'is', true)
      .gte('created_at', startIso).lt('created_at', endIso),
    { orderBy: 'id' },
  );
  if (error || !cohort?.length) return null;

  const ids = cohort.map((c) => c.id);
  const { data: logs, error: logErr } = await fetchAll<{ student_id: string; report_date: string }>(
    () => admin.from('daily_reports').select('student_id, report_date').in('student_id', ids),
    { orderBy: 'student_id' },
  );
  if (logErr) return null;

  const daysBy = new Map<string, Set<string>>();
  for (const l of logs ?? []) {
    const s = daysBy.get(l.student_id) ?? new Set<string>();
    s.add(l.report_date);
    daysBy.set(l.student_id, s);
  }
  const formed = ids.filter((id) => (daysBy.get(id)?.size ?? 0) >= HABIT_MIN_DAYS).length;
  return {
    cohortWeek: startIso,
    signups: ids.length,
    ratePct: Math.round((formed / ids.length) * 1000) / 10,
  };
}
