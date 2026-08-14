// What a saved coaching timetable says about TODAY — and about the student.
//
// Founder, 7 Aug, after uploading a timetable and watching the plan not move:
// "my study plan didn't get aligned with the updated timetable — then what's
// the benefit of uploading?" He is right. Alignment used to be one +25 priority
// bonus spread evenly over every topic the coaching would EVER teach, applied
// only the next time a plan happened to generate. A topic taught today scored
// the same as one taught in week twelve, and today's already-built plan never
// regenerated at all. Uploading changed nothing a student could see.
//
// Three pure functions fixed the three gaps. TWO OF THEM HAVE SINCE BEEN
// REPLACED, and on 14 Aug the replaced pair was deleted rather than left here:
//
//   timetableDailyHours — STILL LIVE, and still owned here. The hours/day the
//                         timetable actually plans, so the student's own number
//                         can be CHECKED against it. Read by api/timetable.
//
//   todaysTaughtTopics  — superseded by timetable-month.coachingTopicsForDate.
//   timetableHorizon    — superseded by timetable-month.anchorToMonth +
//   horizonDaysLeft       monthDaysLeft.
//
// The supersession was not a refactor, it was a bug fix, which is exactly why
// the old pair could not stay. Both read the RAW dates found among the blocks.
// One stray "2023-10-16" sample row in Riya's uploaded sheet put her horizon
// three years in the past on 7 Aug and told her the timetable had run out. The
// live pair anchors to the month we CONFIRMED with her instead. Leaving the raw
// readers here as test-covered exports meant the buggy version was the one a
// future caller would find first — the tests made it look maintained.
//
// Their tests went with them. A test for a function nobody may call is not
// coverage; it is a reason not to delete the function.

import type { TimetableBlock } from './timetable';

/**
 * The daily hours this timetable plans, from the days it actually prices.
 *
 * Median over days that carry minutes — median, not mean, because one 330-min
 * Saturday must not drag five 480-min weekdays into a number nobody planned.
 * Null when fewer than 3 days state minutes: two data points are an anecdote,
 * and this number is used to QUESTION a student's own setting, so it has to
 * be earned. Days summing under an hour are ignored as breaks/rest rows.
 */
export function timetableDailyHours(blocks: TimetableBlock[]): number | null {
  const byDay = new Map<string, number>();
  // The same class stated twice is one class. Live-fire showed the extractor
  // emitting each task once from the daily sheet and once re-derived from the
  // weekly sheet — identical (day, section, topic, minutes) pairs that doubled
  // an 8-hour day into 17 and would have told every student their own number
  // was wrong. Exact duplicates collapse; genuinely distinct tasks (different
  // topic or different minutes) still sum.
  const seen = new Set<string>();
  for (const b of blocks) {
    if (b.minutes == null) continue;
    const key = b.date ?? (b.dayIndex != null ? `idx:${b.dayIndex}` : b.day != null ? `dow:${b.day}` : null) as string | null;
    if (!key) continue;
    const dedupe = `${key}|${b.section ?? ''}|${b.topic ?? b.label}|${b.minutes}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    byDay.set(key, (byDay.get(key) ?? 0) + b.minutes);
  }
  const totals = [...byDay.values()].filter((m) => m >= 60).sort((a, b) => a - b);
  if (totals.length < 3) return null;
  const median = totals[Math.floor(totals.length / 2)];
  return Math.round((median / 60) * 2) / 2;
}

/** Show the "upload your next timetable" nudge when this few days remain. */
export const HORIZON_NUDGE_DAYS = 4;
