/* eslint-disable @typescript-eslint/no-explicit-any */
import { catExamDate } from '@/lib/routine-engine';
import { getLogDateString, MS_PER_DAY } from '@/lib/streak-utils';
import type { PeerRow } from './peer-cohort';

import { fetchAll } from '@/lib/supabase/fetch-all';
type Admin = any;

// ── Turning the database into the shape the peer engine reasons about ───────
//
// The decisions all live in peer-cohort.ts (pure, tested without a database).
// This file only fetches and reshapes — if an `if` about the product appears
// here, it is in the wrong file.
//
// SCALE (docs/SCALE-CONTRACT.md): this reads the whole active base into memory
// once per request, which is correct at 320 students and wrong at 100,000. The
// seam for that is already here rather than promised: buildPeerRows takes rows
// in and returns rows out, so the 100k path is to replace the two queries below
// with a read of a cron-maintained `peer_snapshot` table and change NOTHING
// else — not the engine, not the route, not the UI. The cap below is the guard
// that makes the failure loud (a truncated base) rather than silent (a request
// that times out at 3am and renders an empty card).
//
// Until then: LOOKBACK_DAYS of logs across the base is a few thousand rows.

const LOOKBACK_DAYS = 14;
const CONSISTENCY_WINDOW_DAYS = 7;

/** Above this we are no longer the system this file was written for. */
export const PEER_BASE_CAP = 5_000;

interface ProfileRow {
  id: string;
  attempt_year: number | null;
  study_target_hours: number | null;
  self_reported_weakest_section: string | null;
  syllabus_target_date: string | null;
}

interface LogRow {
  student_id: string;
  report_date: string;
  study_duration: number | null;
  topics_covered: string[] | null;
}

/**
 * Days until this student's exam.
 *
 * Prefers their own chosen target date; falls back to the CAT date for the
 * cycle that target implies. Null when we genuinely do not know — the engine
 * treats null as "no phase" and widens the cohort rather than guessing, which
 * is the whole point of not defaulting it to "this November".
 */
export function daysToExamFrom(syllabusTargetDate: string | null, now: Date): number | null {
  if (syllabusTargetDate) {
    const target = Date.parse(`${syllabusTargetDate}T00:00:00Z`);
    if (!Number.isNaN(target)) {
      // The syllabus target is ~3 weeks before the exam; the exam is what a
      // student counts down to, so map back to the cycle's actual exam date.
      const exam = catExamDate(new Date(target).getUTCFullYear());
      const days = Math.round((exam.getTime() - now.getTime()) / MS_PER_DAY);
      return days >= 0 ? days : null;
    }
  }
  return null;
}

/** Pure: assemble PeerRows from the two row sets. Exported for testing. */
export function buildPeerRows(
  profiles: ProfileRow[],
  logs: LogRow[],
  now: Date,
): PeerRow[] {
  const today = getLogDateString(now);
  const consistencyCutoff = new Date(now.getTime() - CONSISTENCY_WINDOW_DAYS * MS_PER_DAY)
    .toISOString().slice(0, 10);

  const byStudent = new Map<string, LogRow[]>();
  for (const l of logs) {
    const list = byStudent.get(l.student_id);
    if (list) list.push(l); else byStudent.set(l.student_id, [l]);
  }

  return profiles.map((p) => {
    const mine = byStudent.get(p.id) ?? [];

    const todayRows = mine.filter((l) => l.report_date === today);
    // Distinct DAYS, not rows — a student with two rows for one date logged one
    // day, and counting rows would quietly inflate everyone's consistency.
    const recentDays = new Set(
      mine.filter((l) => l.report_date >= consistencyCutoff).map((l) => l.report_date)
    );

    // Observed hours: the mean of days they actually studied, so a rest day
    // does not read as "they study 0 hours". Zero-hour honest logs are real
    // logs (Incident #2) but they are not evidence about study duration.
    const studiedHours = mine
      .map((l) => l.study_duration)
      .filter((h): h is number => typeof h === 'number' && h > 0);

    return {
      studentId: p.id,
      attemptYear: p.attempt_year,
      targetHours: p.study_target_hours,
      weakestSection: p.self_reported_weakest_section,
      daysToExam: daysToExamFrom(p.syllabus_target_date, now),
      loggedToday: todayRows.length > 0,
      loggedDaysLast7: recentDays.size,
      sectionsToday: [...new Set(todayRows.flatMap((l) => l.topics_covered ?? []))],
      observedAvgHours: studiedHours.length > 0
        ? studiedHours.reduce((a, b) => a + b, 0) / studiedHours.length
        : null,
    };
  });
}

/** Load every active student's peer shape. See the SCALE note above. */
export async function loadPeerRows(admin: Admin, now: Date = new Date()): Promise<PeerRow[]> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * MS_PER_DAY).toISOString().slice(0, 10);

  const [{ data: profiles }, { data: logs }] = await Promise.all([
    // Paged, not `.limit(PEER_BASE_CAP)`: PostgREST applies its own max-rows
    // (1000) AFTER a client limit, so the old 5,000 cap could never be reached
    // and the "base hit the cap" warning below could never fire — the base was
    // silently 1,000 from the day the roster passed it (Incident #65).
    fetchAll(() => admin
      .from('profiles')
      .select('id, attempt_year, study_target_hours, self_reported_weakest_section, syllabus_target_date')),
    fetchAll(() => admin
      .from('daily_reports')
      .select('student_id, report_date, study_duration, topics_covered')
      .gte('report_date', since)),
  ]);

  if ((profiles ?? []).length >= PEER_BASE_CAP) {
    // Loud, not silent: past this point the numbers are drawn from a truncated
    // base and would understate the cohort without anybody noticing.
    console.warn(`[peer-cohort] base hit the ${PEER_BASE_CAP} cap — move to a peer_snapshot table before trusting these counts`);
  }

  return buildPeerRows((profiles ?? []) as ProfileRow[], (logs ?? []) as LogRow[], now);
}
