import type { TimetableBlock, TimetableSection } from './timetable';
import { detectShape, anchorToMonth, PLAN_WINDOW_DAYS } from './timetable-month';
import { targetPhrase, type RoutineTask, type Section, type Phase } from './routine-engine';

// ── When a student uploads a timetable, THAT is the plan ────────────────────
//
// Founder, 14 Aug: "if someone uploads their timetable it must be implemented
// then and there, and the timetable built on our app through coverage matrix
// should become dead instantly. One study plan per student."
//
// He is right, and the live evidence is Vedashri's 13 August. Her coaching
// sheet says three things — VARC Editorial Reading 120m, QA Profit & Loss
// 180m, DILR Arrangements 120m, seven hours. What the app handed her was:
//
//   VARC Editorial Reading  144m   (sheet said 120)
//   QA   Profit & Loss      144m   (sheet said 180)
//   DILR Arrangements        96m   (sheet said 120)
//   DILR Tables              96m   ← her coaching never assigned this
//
// Every topic her coaching named did win its slot, so alignment "worked" by
// the old definition. But the day was still SIZED from her profile (8h), then
// sliced into blocks, and only then were topics chosen per block. The
// timetable could influence WHICH topic filled a slot; it could never decide
// how many slots there were or how long they ran. DILR's share came to 192
// minutes, that exceeded one block, so a second DILR slot opened and the
// coverage matrix filled it with a topic nobody had assigned.
//
// That is two plans wearing one name, which is exactly what the founder
// called out — and it is worse than an unaligned plan, because the student
// cannot tell which parts came from their coaching and which we invented.
//
// So this module inverts the order. When the sheet speaks for a date, the
// sheet IS the day: its blocks, its topics, its own minutes, in its own
// order. The coverage matrix contributes nothing — not a bonus, not a filler
// block, nothing. It is dead for that day.
//
// WHAT THIS MODULE WILL NOT DO. It never invents a block to reach the
// student's hours target. If a coaching plans five hours and the student told
// us eight, the honest output is five — the extra three are the student's to
// spend, and quietly appending our own topic to close the gap is the precise
// bug this exists to kill. The hours MISMATCH is surfaced elsewhere
// (timetableDailyHours, already shown at upload) and stays a question we ask,
// never a decision we take.
//
// Silence is also honest: a date the sheet says nothing about returns null,
// and the caller falls back to the generated plan. A rest day the coaching
// planned is not an instruction to study nothing forever, and a sheet that
// has run out should hand the student back to a working plan rather than an
// empty screen.

/** One block of the coaching's own day, kept whole. */
export interface CoachingBlock {
  section: TimetableSection | null;
  topic: string | null;
  /** The sheet's own words for this block, verbatim. */
  label: string;
  /** Minutes the sheet stated. null when it printed none — never estimated. */
  minutes: number | null;
}

/**
 * A block earns a place only when it names something we can act on. "SLEEP",
 * "GYM", "LUNCH" name neither a topic nor a section — dropped quietly, exactly
 * as timetable-month does, so the two modules can never disagree about what
 * counts as study.
 */
function studyish(b: TimetableBlock): boolean {
  return b.topic != null || b.section != null;
}

/**
 * The coaching's blocks for one date, in the sheet's own order.
 *
 * Anchoring matches coachingTopicsForDate exactly — same shape detection, same
 * month window, same confirmed_at start — because a student must never see the
 * topic list and the task list disagree about what day it is. The difference is
 * only in what survives: this keeps per-block minutes and labels, which
 * anchorToMonth deliberately flattens away.
 */
export function coachingBlocksForDate(
  blocks: TimetableBlock[],
  confirmedAt: string | null | undefined,
  todayIso: string,
): CoachingBlock[] {
  if (blocks.length === 0) return [];
  const start = typeof confirmedAt === 'string' && confirmedAt.length >= 10
    ? confirmedAt.slice(0, 10)
    : todayIso;
  if (todayIso < start) return [];

  const usable = blocks.filter(studyish);
  const shape = detectShape(blocks);
  if (shape === 'empty') return [];

  if (shape === 'dated') {
    return usable.filter((b) => b.date === todayIso).map(toCoachingBlock);
  }

  if (shape === 'weekly') {
    const dow = dowOfIso(todayIso);
    return usable.filter((b) => b.day === dow).map(toCoachingBlock);
  }

  // A sequence sheet has no anchor of its own, so it is spread across the
  // month by anchorToMonth. Rather than re-implement that spread (two
  // implementations of the same arithmetic is how the mirror-drift bugs in
  // this codebase started), read which topics land on today and pull the
  // matching blocks back out in the sheet's order.
  const cal = anchorToMonth(blocks, start, PLAN_WINDOW_DAYS);
  const todays = cal.find((d) => d.date === todayIso);
  if (!todays || todays.topics.length === 0) return [];
  const wanted = new Set(todays.topics);
  const seen = new Set<string>();
  const out: CoachingBlock[] = [];
  for (const b of usable) {
    if (!b.topic || !wanted.has(b.topic) || seen.has(b.topic)) continue;
    seen.add(b.topic);
    out.push(toCoachingBlock(b));
  }
  return out;
}

function toCoachingBlock(b: TimetableBlock): CoachingBlock {
  return {
    section: b.section,
    topic: b.topic,
    label: b.label,
    minutes: typeof b.minutes === 'number' && b.minutes > 0 ? Math.round(b.minutes) : null,
  };
}

function dowOfIso(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00Z').getUTCDay(); // Sun=0
  return d === 0 ? 6 : d - 1;
}

/** Below this a "block" is a note, not a study session. */
export const MIN_BLOCK_MINUTES = 15;

/**
 * The same two blocks printed twice on one sheet are one session, not two.
 * Deduped on (section, topic) with minutes summed, because a coaching that
 * prints "QA 10-11" and "QA 4-5" for Percentages has planned two hours of
 * Percentages, not two separate assignments a student must tick twice.
 */
function mergeBlocks(day: CoachingBlock[]): CoachingBlock[] {
  const out: CoachingBlock[] = [];
  const index = new Map<string, number>();
  for (const b of day) {
    const key = `${b.section ?? '-'}::${b.topic ?? '-'}`;
    const at = index.get(key);
    if (at == null) {
      index.set(key, out.length);
      out.push({ ...b });
      continue;
    }
    const prev = out[at];
    if (b.minutes != null) prev.minutes = (prev.minutes ?? 0) + b.minutes;
  }
  return out;
}

const SECTIONS: readonly string[] = ['VARC', 'DILR', 'QA'];

/**
 * The coaching's own instruction for a block, when it printed one.
 *
 * This exists because our generated target was overriding her coaching in the
 * one line she is most likely to read. Vedashri's sheet says "30 min editorial
 * + 1 RC passage"; targetPhrase turned that into "Learn Editorial Reading,
 * solve 12 questions" — a volume WE computed from minutes, for a reading task
 * that has no questions. On a plan whose whole promise is "this is your
 * coaching's timetable", the sheet outranks our phrasing.
 *
 * The leading duration is stripped ("2 hrs: 30 min editorial…" → "30 min
 * editorial…") because the minutes already render beside the task, and a task
 * that states its length twice reads like a bug.
 *
 * Returns null when the label is just the topic name again or too thin to be
 * an instruction — then targetPhrase is the better line, and it is used.
 */
export function sheetInstruction(label: string, topic: string | null): string | null {
  if (!label) return null;
  const stripped = label.replace(/^\s*\d+(\.\d+)?\s*(hrs?|hours?|mins?|minutes?)\s*[:\-–]\s*/i, '').trim();
  if (stripped.length < 8) return null;
  // Just the topic restated is not an instruction.
  if (topic && stripped.toLowerCase() === topic.toLowerCase()) return null;
  return stripped;
}

/**
 * The coaching's day, as the student's task list. `null` means the sheet said
 * nothing about this date and the caller must fall back to the generated plan.
 *
 * `dayMinutes` is only ever used to price blocks the sheet left unpriced, and
 * only by splitting what the sheet DOES cover — it can never add a block.
 */
export function tasksFromCoachingDay(
  day: CoachingBlock[],
  dayMinutes: number,
  phase: Phase = 'foundation',
): RoutineTask[] | null {
  const merged = mergeBlocks(day).filter((b) => b.topic != null || b.section != null);
  if (merged.length === 0) return null;

  // Blocks the sheet priced keep their own minutes. The rest share whatever is
  // left of the student's day — and if the sheet priced everything, nothing is
  // shared and the day is exactly as long as the coaching planned it.
  const priced = merged.filter((b) => b.minutes != null && b.minutes >= MIN_BLOCK_MINUTES);
  const unpriced = merged.filter((b) => !(b.minutes != null && b.minutes >= MIN_BLOCK_MINUTES));
  const pricedTotal = priced.reduce((s, b) => s + (b.minutes ?? 0), 0);
  const remaining = Math.max(0, Math.round(dayMinutes) - pricedTotal);
  const perUnpriced = unpriced.length > 0
    ? Math.max(MIN_BLOCK_MINUTES, Math.round(remaining / unpriced.length))
    : 0;

  const tasks: RoutineTask[] = [];
  merged.forEach((b, i) => {
    const minutes = (b.minutes != null && b.minutes >= MIN_BLOCK_MINUTES) ? b.minutes : perUnpriced;
    const section: Section | 'General' = SECTIONS.includes(b.section ?? '')
      ? (b.section as Section)
      : 'General';
    tasks.push({
      // Stable within the day and marked by origin, so a tick maps back to the
      // same block on a re-read and nothing collides with an engine task id.
      id: `tt-${i}-${(b.topic ?? b.section ?? 'block').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      section,
      topic: b.topic,
      label: b.topic ? `${section} — ${b.topic}` : (b.label || String(section)),
      // The sheet's own instruction wins. Only when it printed none do we
      // fall back to our generated phrasing — and a block naming a section but
      // no topic can only ever use the sheet's words, since targetPhrase needs
      // one of OUR topics to say anything true.
      target: sheetInstruction(b.label, b.topic)
        ?? ((b.topic && section !== 'General')
          ? targetPhrase(section as Section, b.topic, minutes, phase)
          : (b.label || null)),
      estMinutes: minutes,
      // The reason is the whole point of uploading, and it must stay checkable
      // against the sheet in the student's hand.
      reason: 'From your coaching timetable',
    });
  });
  return tasks;
}

/**
 * THE one call both plan writers make. `null` = the sheet is silent for this
 * date, generate as usual.
 *
 * There are exactly two writers of daily_routines — the notification cron
 * (lib/routine-plan) and the tracker route (api/routine/today). The cron's
 * plan-writing slots run in the EVENING (20:30 / 21:30 IST), not at 6am as an
 * earlier version of this comment claimed, so the student's own request is
 * usually first. But the cron is still the first writer for anyone who never
 * opens the app, and it rebuilds the row after every delete (hours change,
 * timetable apply). If only the tracker honoured the timetable, those students
 * would silently get a coverage-matrix day instead — a fix that looks complete
 * in every test and is wrong in production for exactly the quietest cohort.
 * So the decision lives here once, and both writers ask it.
 */
export function timetableDayTasks(input: {
  planSource: string | null | undefined;
  blocks: TimetableBlock[] | null | undefined;
  confirmedAt: string | null | undefined;
  todayIso: string;
  dayMinutes: number;
  phase?: Phase;
}): RoutineTask[] | null {
  if (input.planSource !== 'coaching') return null;
  const day = coachingBlocksForDate(input.blocks ?? [], input.confirmedAt, input.todayIso);
  return tasksFromCoachingDay(day, input.dayMinutes, input.phase ?? 'foundation');
}

/** Total minutes the coaching itself planned, or null if it priced nothing. */
export function coachingDayMinutes(day: CoachingBlock[]): number | null {
  const merged = mergeBlocks(day);
  const total = merged.reduce((s, b) => s + (b.minutes ?? 0), 0);
  return total > 0 ? total : null;
}
