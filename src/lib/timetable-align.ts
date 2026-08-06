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
// Three pure functions fix the three gaps:
//   todaysTaughtTopics  — which topics the timetable puts on TODAY, so the
//                         selector can make today's class decisive, not a tiebreak.
//   timetableDailyHours — the hours/day the timetable actually plans, so the
//                         student's own number can be CHECKED against it.
//   timetableHorizon    — when a dated timetable runs out, so the student is
//                         reminded to upload the next one instead of silently
//                         falling off the end.

import type { TimetableBlock } from './timetable';

const DAY_MS = 86_400_000;

/** Monday=0..Sunday=6, matching TimetableBlock.day. */
function dowOf(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00Z').getUTCDay(); // Sun=0
  return d === 0 ? 6 : d - 1;
}

/**
 * Topics the coaching teaches on `todayIso`, from either shape:
 * dated rows matching the date, or recurring-weekly rows matching the weekday.
 * Day-N plans have no anchor to today and contribute nothing — honest, not
 * clever. Deduped, order preserved.
 */
export function todaysTaughtTopics(blocks: TimetableBlock[], todayIso: string): string[] {
  const dow = dowOf(todayIso);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of blocks) {
    if (!b.topic) continue;
    const isToday = b.date ? b.date === todayIso : b.date == null && b.dayIndex == null && b.day === dow;
    if (!isToday || seen.has(b.topic)) continue;
    seen.add(b.topic);
    out.push(b.topic);
  }
  return out;
}

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

/** The last dated day this timetable covers. Null for undated shapes. */
export function timetableHorizon(blocks: TimetableBlock[]): string | null {
  let max: string | null = null;
  for (const b of blocks) {
    if (b.date && (!max || b.date > max)) max = b.date;
  }
  return max;
}

/**
 * Days of timetable left, counting today. 0 = ran out. Null when undated —
 * a recurring weekly timetable never runs out.
 */
export function horizonDaysLeft(blocks: TimetableBlock[], todayIso: string): number | null {
  const horizon = timetableHorizon(blocks);
  if (!horizon) return null;
  return Math.max(0, Math.round((Date.parse(horizon + 'T00:00:00Z') - Date.parse(todayIso + 'T00:00:00Z')) / DAY_MS) + 1);
}

/** Show the "upload your next timetable" nudge when this few days remain. */
export const HORIZON_NUDGE_DAYS = 4;
