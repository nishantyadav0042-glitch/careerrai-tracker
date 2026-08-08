import type { TimetableBlock, TimetableSection } from './timetable';

// ── One month, anchored to real dates ───────────────────────────────────────
//
// Founder, 8 Aug: "अगर हम monthly ही timetable बना सकते हैं तो limit कर दो.
// उसको बोलो एक month का ही upload करो… एक month का timetable proper aligned
// होना चाहिए with zero errors… student को लगे कि इसने तो बिल्कुल exact same
// मेरा timetable system में उठा लिया."
//
// WHY THIS MODULE EXISTS. Extraction was never the problem. Both real uploads
// in the live database extracted well — Riya's matched 47 of 48 topics — and
// both produced a plan that did nothing, because of what happened AFTER
// extraction:
//
//   · Riya's 48 blocks all carried day: 0. It is a syllabus topic LIST, not a
//     Monday class. So todaysTaughtTopics returned all 48 every Monday (a
//     +45 bonus on every candidate differentiates nothing) and zero on the
//     other six days.
//   · One stray "2023-10-16" among her blocks made timetableHorizon read three
//     years into the past, and she was pushed "Your timetable has run out" on
//     7 Aug for a recurring sheet that cannot run out.
//   · Abhishek's sheet was his OWN routine — SLEEP, GYM, CRICKET, QUANT DPP —
//     with one topic in sixteen blocks.
//
// The fix is not a better prompt. It is refusing to trust the anchor a model
// put on a row, and deciding the sheet's SHAPE from the evidence in it. Three
// shapes exist, they are told apart deterministically, and all three come out
// as the same thing: a list of real dates, each naming what is in play.
//
// Nothing here decides how MUCH a student studies. The floor sizes the day and
// the routine engine picks the tasks. This module answers exactly one
// question: on this date, what is this student's coaching doing?

export const PLAN_WINDOW_DAYS = 31;

const DAY_MS = 86_400_000;

/** A single real date, and what the coaching sheet puts on it. */
export interface CoachingDay {
  date: string;                  // YYYY-MM-DD
  topics: string[];              // our topic names, deduped, order preserved
  sections: TimetableSection[];  // sections in play even when no topic matched
  labels: string[];              // the sheet's own words, for showing back
  minutes: number | null;        // planned minutes, only when the sheet said so
}

/**
 * How the uploaded sheet is actually organised. Decided from the blocks, never
 * from what the student said the file was — students mislabel, and the
 * consequence of believing a wrong label is a month of wrong plans.
 */
export type SheetShape = 'dated' | 'weekly' | 'sequence' | 'empty';

/**
 * A single weekday carrying this many topic-bearing blocks is not a class day.
 * No coaching teaches twelve distinct CAT topics on one Monday evening; a
 * sheet like that is a syllabus list the extractor had to anchor SOMEWHERE.
 * Riya's real file sat at 48 — four times this threshold.
 */
export const SEQUENCE_SAME_DAY_THRESHOLD = 12;

function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function parseIso(s: string): number { return Date.parse(s + 'T00:00:00Z'); }

/** Monday=0 … Sunday=6, matching TimetableBlock.day. */
function dowOf(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00Z').getUTCDay(); // Sun=0
  return d === 0 ? 6 : d - 1;
}

function studyish(b: TimetableBlock): boolean {
  // A block earns a place in the plan when it names something we can act on.
  // "SLEEP", "GYM", "LUNCH BREAK" name neither a topic nor a section and are
  // simply not our business — but they are NOT errors either, so they are
  // dropped quietly rather than failing the upload.
  return b.topic != null || b.section != null;
}

/**
 * Which shape is this sheet? Order matters: dates are the strongest evidence,
 * then a genuine spread of weekdays, and everything left over is a sequence.
 */
export function detectShape(blocks: TimetableBlock[]): SheetShape {
  const usable = blocks.filter(studyish);
  if (usable.length === 0) return 'empty';

  const dated = usable.filter((b) => b.date != null);
  // A handful of dates among many undated rows is a sample row or a header —
  // exactly the "2023-10-16" that expired Riya's sheet. Real dated calendars
  // are mostly dated.
  if (dated.length >= Math.max(3, usable.length * 0.5)) return 'dated';

  const weekdays = new Set(usable.filter((b) => b.day != null).map((b) => b.day));
  if (weekdays.size >= 2) return 'weekly';

  // Everything on one weekday: a list, not a class day — see the threshold.
  if (weekdays.size === 1 && usable.length >= SEQUENCE_SAME_DAY_THRESHOLD) return 'sequence';
  if (weekdays.size === 1) return 'weekly';

  return 'sequence';
}

/** Sort key for sequence mode: dayIndex when present, else input order. */
function sequenceOrder(blocks: TimetableBlock[]): TimetableBlock[] {
  const withIdx = blocks.map((b, i) => ({ b, i }));
  withIdx.sort((x, y) => {
    const a = x.b.dayIndex, c = y.b.dayIndex;
    if (a != null && c != null && a !== c) return a - c;
    if (a != null && c == null) return -1;
    if (a == null && c != null) return 1;
    return x.i - y.i;
  });
  return withIdx.map((x) => x.b);
}

function emptyDay(date: string): CoachingDay {
  return { date, topics: [], sections: [], labels: [], minutes: null };
}

function addBlock(day: CoachingDay, b: TimetableBlock): void {
  if (b.topic && !day.topics.includes(b.topic)) day.topics.push(b.topic);
  if (b.section && !day.sections.includes(b.section)) day.sections.push(b.section);
  if (b.label && !day.labels.includes(b.label)) day.labels.push(b.label);
  if (typeof b.minutes === 'number' && b.minutes > 0) day.minutes = (day.minutes ?? 0) + b.minutes;
}

/**
 * Turn any sheet into ONE MONTH of real dates starting at `startIso`.
 *
 * Every returned day is a real calendar date, in order, with no gaps — a day
 * the coaching does nothing is returned empty rather than omitted, because the
 * caller asking "what is on the 14th?" deserves an answer either way.
 */
export function anchorToMonth(
  blocks: TimetableBlock[],
  startIso: string,
  days: number = PLAN_WINDOW_DAYS,
): CoachingDay[] {
  const span = Math.max(1, Math.min(62, Math.round(days)));
  const start = parseIso(startIso);
  const calendar: CoachingDay[] = [];
  for (let i = 0; i < span; i++) calendar.push(emptyDay(iso(new Date(start + i * DAY_MS))));
  const byDate = new Map(calendar.map((d) => [d.date, d]));

  const usable = blocks.filter(studyish);
  const shape = detectShape(blocks);
  if (shape === 'empty') return calendar;

  if (shape === 'dated') {
    // Only rows inside the window. A dated sheet reaching past the month is
    // not truncated by us here — it simply plans further than we promise.
    for (const b of usable) {
      if (!b.date) continue;
      const day = byDate.get(b.date);
      if (day) addBlock(day, b);
    }
    return calendar;
  }

  if (shape === 'weekly') {
    // A class grid repeats. Every Tuesday in the window gets Tuesday's classes.
    for (const day of calendar) {
      const dow = dowOf(day.date);
      for (const b of usable) if (b.day === dow) addBlock(day, b);
    }
    return calendar;
  }

  // ── sequence ──────────────────────────────────────────────────────────────
  // A syllabus list, or a "Day 1 … Day N" plan. Spread it evenly across the
  // month in the order the sheet gave, so the student moves through their
  // coaching's own order instead of meeting all 48 topics every Monday.
  //
  // Evenly, not front-loaded: a coaching list is a month of work, and pushing
  // it all into week one recreates the oversized plan the bad-day floor exists
  // to prevent.
  const ordered = sequenceOrder(usable);
  const perDay = Math.max(1, Math.ceil(ordered.length / span));
  for (let i = 0; i < ordered.length; i++) {
    const dayIdx = Math.min(span - 1, Math.floor(i / perDay));
    addBlock(calendar[dayIdx], ordered[i]);
  }
  return calendar;
}

/**
 * The one call the planner makes. Anchors the month from the day the student
 * uploaded, then answers "what is coaching doing on this date?".
 *
 * Both plan callers (api/routine/today and lib/routine-plan) go through this
 * so the morning notification and the tracker can never name different topics
 * — the mirror-drift this codebase has paid for twice.
 *
 * `confirmedAt` missing means an old row saved before we recorded it; falling
 * back to `todayIso` gives a month starting now, which is honest: we do not
 * know when it was uploaded, so we do not pretend the month is half spent.
 */
export function coachingTopicsForDate(
  blocks: TimetableBlock[],
  confirmedAt: string | null | undefined,
  todayIso: string,
): string[] {
  if (blocks.length === 0) return [];
  const start = typeof confirmedAt === 'string' && confirmedAt.length >= 10
    ? confirmedAt.slice(0, 10)
    : todayIso;
  // Past the month, a sheet stops speaking rather than repeating itself. The
  // horizon nudge is what asks for the next one.
  if (todayIso < start) return [];
  const cal = anchorToMonth(blocks, start);
  return topicsOnDate(cal, todayIso);
}

/** What the coaching puts on one specific date. Empty array = nothing. */
export function topicsOnDate(calendar: CoachingDay[], dateIso: string): string[] {
  return calendar.find((d) => d.date === dateIso)?.topics ?? [];
}

/** Sections in play on a date, for sheets that name a section but no topic. */
export function sectionsOnDate(calendar: CoachingDay[], dateIso: string): TimetableSection[] {
  return calendar.find((d) => d.date === dateIso)?.sections ?? [];
}

/**
 * The last date this month-plan covers, and how many days of it are left.
 *
 * Computed from the ANCHORED calendar, never from the maximum date found among
 * raw blocks. That is the whole fix for the false "your timetable has run out"
 * push: a stray sample date on a weekly sheet cannot reach this number.
 */
export function monthHorizon(calendar: CoachingDay[]): string | null {
  return calendar.length > 0 ? calendar[calendar.length - 1].date : null;
}

export function monthDaysLeft(calendar: CoachingDay[], todayIso: string): number | null {
  const horizon = monthHorizon(calendar);
  if (!horizon) return null;
  return Math.max(0, Math.round((parseIso(horizon) - parseIso(todayIso)) / DAY_MS) + 1);
}

/**
 * What we read, in numbers the student can check against their own sheet.
 * This is the "yes — it took my exact timetable" moment, so every figure is
 * counted from the anchored calendar rather than described in prose.
 */
export interface MonthSummary {
  shape: SheetShape;
  daysCovered: number;      // days in the window that carry anything
  totalDays: number;
  topics: number;           // distinct topics across the month
  sections: TimetableSection[];
  firstDate: string | null; // first day with content
  lastDate: string | null;  // last day with content
  plannedMinutes: number | null;
}

export function summariseMonth(calendar: CoachingDay[], shape: SheetShape): MonthSummary {
  const busy = calendar.filter((d) => d.topics.length > 0 || d.sections.length > 0);
  const topics = new Set<string>();
  const sections = new Set<TimetableSection>();
  let minutes = 0;
  let hasMinutes = false;
  for (const d of busy) {
    for (const t of d.topics) topics.add(t);
    for (const s of d.sections) sections.add(s);
    if (d.minutes != null) { minutes += d.minutes; hasMinutes = true; }
  }
  return {
    shape,
    daysCovered: busy.length,
    totalDays: calendar.length,
    topics: topics.size,
    sections: [...sections],
    firstDate: busy[0]?.date ?? null,
    lastDate: busy[busy.length - 1]?.date ?? null,
    plannedMinutes: hasMinutes ? minutes : null,
  };
}
