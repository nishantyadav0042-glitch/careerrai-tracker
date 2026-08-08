import { TOPIC_METADATA } from './topics-constants';
import {
  remainingSyllabusHours, remainingMockHours, recommendedMockCount,
  MOCK_HOURS_EACH, type TopicStatusRow,
} from './study-pace';
import { catExamDate } from './routine-engine';

// ── The Replan Engine ───────────────────────────────────────────────────────
//
// The founder's rule for this feature (5 Aug): "precise and trustworthy" beats
// fast — a 2–3 minute regeneration is fine, a number a buddy cannot defend on
// a call is not. So EVERY option this engine returns carries its own
// arithmetic in `receipts`, in the same words a buddy would say out loud.
//
// The product decision this encodes: we do NOT build a timetable editor. When
// life changes, only four inputs change — the finish date, the hours a student
// can actually give, which section leads, and whether a week is paused. The
// plan regenerates from those. This module answers the one question that
// matters when a student says "15 din waste ho gaye": what are my honest
// options now, and what does each one cost?
//
// Four options, deliberately including the uncomfortable one:
//   A keep_date   — hold the date, pay in hours/day
//   B keep_hours  — hold the hours, pay in calendar
//   C balanced    — split the difference (usually the humane answer)
//   D cut_scope   — hold BOTH, pay in syllabus (premium, and guarded below)
//
// Guards that make this trustworthy rather than motivational:
//   • an option past the CAT date is returned but marked infeasible — we never
//     quietly hand back a plan that finishes after the exam;
//   • >12 hrs/day is marked infeasible (same threshold as the pace card);
//   • cut_scope may ONLY drop weightage ≤2 topics. The engine will never tell
//     a student to skip Percentages or Reading Comprehension to hit a date.

/** Weightage at or below which a topic may be sacrificed to protect a date. */
export const DROPPABLE_MAX_WEIGHTAGE = 2;
/** Above this, no human can sustain the plan — matches the pace card. */
export const MAX_SUSTAINABLE_HOURS = 12;

export type ReplanOptionKind = 'keep_date' | 'keep_hours' | 'balanced' | 'cut_scope';

export interface ReplanOption {
  kind: ReplanOptionKind;
  /** Short human label, e.g. "Keep 17 Sept". */
  label: string;
  /** ISO yyyy-mm-dd the syllabus finishes under this option. */
  finishDate: string;
  hoursPerDay: number;
  /** Topics this option sacrifices (cut_scope only); always [] otherwise. */
  droppedTopics: string[];
  /** Hours of syllabus removed by droppedTopics. */
  droppedHours: number;
  feasible: boolean;
  /** Why it is not feasible, in the words a buddy would use. */
  warning?: string;
  /** The arithmetic, so the number can be defended on a call. */
  receipts: string[];
}

export interface ReplanResult {
  /** True when the student's REAL pace still clears the date. */
  onTrack: boolean;
  /** The pace the verdict was computed from, and where it came from. */
  pacePerDay: number | null;
  paceSource: 'observed' | 'committed' | 'none';
  remainingSyllabusHours: number;
  mockCount: number;
  mockHours: number;
  totalHoursNeeded: number;
  daysToTarget: number;
  /** Hours/day the CURRENT target actually demands. */
  requiredPerDay: number;
  committedPerDay: number | null;
  options: ReplanOption[];
  /** The option we'd put forward first. Null when on track. */
  recommended: ReplanOptionKind | null;
  /** One line a buddy can read aloud to open the conversation. */
  headline: string;
}

const DAY_MS = 86_400_000;
const HALF = (n: number) => Math.round(n * 2) / 2;
const iso = (d: Date) => d.toISOString().split('T')[0];

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

function pretty(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Days between two dates, floored at 1 — a plan always has at least today. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY_MS));
}

/**
 * Topics eligible to be sacrificed, cheapest-value-first: lowest weightage,
 * then most hours saved (drop the expensive low-value topic before the cheap
 * one). Only not_started / learning topics are considered — a topic already
 * being revised is sunk effort and dropping it wastes what the student did.
 */
// `effort` is required for the same reason the totals scale: these are the
// hours a student SAVES by dropping a topic, and a saving quoted from the
// unscaled model would not add up against a scaled total.
export function droppableTopics(rows: TopicStatusRow[], effort: number): { topic: string; hours: number; weightage: number }[] {
  const statusByTopic = new Map<string, string>();
  for (const r of rows) if (r.status) statusByTopic.set(r.topic, r.status);

  const out: { topic: string; hours: number; weightage: number }[] = [];
  for (const [topic, meta] of Object.entries(TOPIC_METADATA)) {
    if (meta.weightage > DROPPABLE_MAX_WEIGHTAGE) continue;
    const status = statusByTopic.get(topic) ?? 'not_started';
    if (status !== 'not_started' && status !== 'learning') continue;
    const frac = status === 'learning' ? 0.65 : 1.0;
    out.push({ topic, hours: Math.round(meta.estimatedHours * frac * effort), weightage: meta.weightage });
  }
  return out.sort((a, b) => (a.weightage - b.weightage) || (b.hours - a.hours));
}

export interface ReplanInput {
  coverage: TopicStatusRow[];
  /** The date the student currently owns. */
  targetDate: Date;
  /** Hours/day they committed to at signup. An aspiration, not evidence. */
  committedPerDay: number | null;
  /**
   * Hours/day they ACTUALLY average, from logged study. This — not the
   * committed number — decides whether a date is real. Found by testing the
   * engine on live data: our first premium student had declared 12 hrs/day
   * and logged two sessions ever, so a committed-only engine called him
   * "on track" all the way to a date he could never hit. An engine that
   * flatters is worse than no engine. Null = not enough logs yet.
   */
  observedPerDay?: number | null;
  today: Date;
  /** Days unavailable in the window (exams, travel, illness). Default 0. */
  pausedDays?: number;
  /** Exam year for the "past CAT" guard. Defaults from today. */
  examYear?: number;
  /**
   * How much of the standard syllabus effort this student needs — 1.0 for a
   * first attempt, less for a repeater with a percentile on record. Required,
   * not optional: a silent 1.0 default here would quote every repeater a
   * first-timer's syllabus and then recommend cutting scope they don't need
   * to cut. See studentEffortMultiplier in study-pace.
   */
  effortMultiplier: number;
}

export function computeReplan(input: ReplanInput): ReplanResult {
  const { coverage, targetDate, committedPerDay, today } = input;
  const observedPerDay = input.observedPerDay ?? null;
  // Evidence beats aspiration: judge the date against what the student
  // actually does, falling back to what they promised only when we have no
  // logs yet. Every option below is then built around this same number.
  const pacePerDay = observedPerDay ?? committedPerDay;
  const paceSource: 'observed' | 'committed' | 'none' =
    observedPerDay != null ? 'observed' : committedPerDay != null ? 'committed' : 'none';
  const pausedDays = Math.max(0, input.pausedDays ?? 0);

  const syllabus = remainingSyllabusHours(coverage, input.effortMultiplier);
  const mockCount = recommendedMockCount(syllabus);
  const mockHours = remainingMockHours(syllabus);
  const totalHoursNeeded = syllabus + mockHours;

  // Paused days are removed from the usable window, not from the calendar.
  const rawDays = daysBetween(today, targetDate);
  const daysToTarget = Math.max(1, rawDays - pausedDays);
  const requiredPerDay = HALF(totalHoursNeeded / daysToTarget);

  let examYear = input.examYear ?? today.getFullYear();
  if (today > catExamDate(examYear)) examYear += 1;
  const examDate = catExamDate(examYear);

  const baseReceipt =
    `${syllabus} hrs syllabus left + ${mockCount} mocks × ${MOCK_HOURS_EACH} hrs ` +
    `= ${totalHoursNeeded} hrs total`;

  // Already fine: the committed pace covers what's left.
  const onTrack = totalHoursNeeded <= 0 || (pacePerDay != null && pacePerDay >= requiredPerDay);
  if (onTrack) {
    return {
      onTrack: true, remainingSyllabusHours: syllabus, mockCount, mockHours, totalHoursNeeded,
      daysToTarget, requiredPerDay, committedPerDay, pacePerDay, paceSource,
      options: [], recommended: null,
      headline: totalHoursNeeded <= 0
        ? 'Syllabus complete — this is now a revision and mock plan.'
        : `On track: ${requiredPerDay} hrs/day needed, averaging ${pacePerDay}.`,
    };
  }

  const options: ReplanOption[] = [];

  // ── A · Keep the date, pay in hours ───────────────────────────────────────
  const aFeasible = requiredPerDay <= MAX_SUSTAINABLE_HOURS;
  options.push({
    kind: 'keep_date',
    label: `Keep ${pretty(iso(targetDate))}`,
    finishDate: iso(targetDate),
    hoursPerDay: requiredPerDay,
    droppedTopics: [], droppedHours: 0,
    feasible: aFeasible,
    warning: aFeasible ? undefined : `${requiredPerDay} hrs/day is not sustainable — this date has passed the point of being real.`,
    receipts: [
      baseReceipt,
      `${totalHoursNeeded} hrs ÷ ${daysToTarget} days = ${requiredPerDay} hrs/day`,
      pacePerDay != null ? `You average ${pacePerDay} hrs/day — this asks for ${HALF(requiredPerDay - pacePerDay)} more.` : '',
    ].filter(Boolean),
  });

  // ── B · Keep the hours, pay in calendar ───────────────────────────────────
  const bHours = pacePerDay ?? Math.max(1, HALF(requiredPerDay / 2));
  const bDaysNeeded = Math.ceil(totalHoursNeeded / bHours) + pausedDays;
  const bDate = addDays(today, bDaysNeeded);
  const bPastExam = bDate > examDate;
  options.push({
    kind: 'keep_hours',
    label: `Keep ${bHours} hrs/day`,
    finishDate: iso(bDate),
    hoursPerDay: bHours,
    droppedTopics: [], droppedHours: 0,
    feasible: !bPastExam,
    warning: bPastExam ? `This finishes after CAT (${pretty(iso(examDate))}). At ${bHours} hrs/day the syllabus does not fit before the exam.` : undefined,
    receipts: [
      baseReceipt,
      `${totalHoursNeeded} hrs ÷ ${bHours} hrs/day = ${bDaysNeeded - pausedDays} study days`,
      pausedDays > 0 ? `+ ${pausedDays} paused days = finish ${pretty(iso(bDate))}` : `Finish ${pretty(iso(bDate))}`,
    ].filter(Boolean),
  });

  // ── C · Balanced — move both, halfway ─────────────────────────────────────
  const cHours = pacePerDay != null ? HALF((pacePerDay + requiredPerDay) / 2) : requiredPerDay;
  const cDaysNeeded = Math.ceil(totalHoursNeeded / cHours) + pausedDays;
  const cDate = addDays(today, cDaysNeeded);
  const cPastExam = cDate > examDate;
  const cFeasible = !cPastExam && cHours <= MAX_SUSTAINABLE_HOURS;
  options.push({
    kind: 'balanced',
    label: `${cHours} hrs/day · ${pretty(iso(cDate))}`,
    finishDate: iso(cDate),
    hoursPerDay: cHours,
    droppedTopics: [], droppedHours: 0,
    feasible: cFeasible,
    warning: cPastExam ? `This finishes after CAT (${pretty(iso(examDate))}).` : undefined,
    receipts: [
      baseReceipt,
      pacePerDay != null
        ? `Halfway between your real ${pacePerDay} and the ${requiredPerDay} the old date demanded = ${cHours} hrs/day`
        : `${cHours} hrs/day`,
      `${totalHoursNeeded} hrs ÷ ${cHours} hrs/day → finish ${pretty(iso(cDate))}`,
    ],
  });

  // ── D · Cut scope — hold the date AND the hours, pay in syllabus ──────────
  // Only ever sacrifices weightage ≤2 topics not yet practised. If that isn't
  // enough to close the gap, the option is returned INFEASIBLE rather than
  // eating into high-weightage syllabus. We would rather say "this cannot be
  // fixed by dropping topics" than quietly recommend skipping Arithmetic.
  const dHours = pacePerDay ?? requiredPerDay;
  const budget = dHours * daysToTarget;
  const gap = totalHoursNeeded - budget;
  const dropped: string[] = [];
  let droppedHours = 0;
  if (gap > 0) {
    for (const t of droppableTopics(coverage, input.effortMultiplier)) {
      if (droppedHours >= gap) break;
      dropped.push(t.topic);
      droppedHours += t.hours;
    }
  }
  const dEnough = gap <= 0 || droppedHours >= gap;
  options.push({
    kind: 'cut_scope',
    label: `Keep both — drop ${dropped.length} low-weight topic${dropped.length === 1 ? '' : 's'}`,
    finishDate: iso(targetDate),
    hoursPerDay: dHours,
    droppedTopics: dropped,
    droppedHours,
    feasible: dEnough && dropped.length > 0,
    warning: !dEnough
      ? `Dropping every low-weightage topic saves only ${droppedHours} of the ${Math.round(gap)} hrs needed. This gap cannot be closed by cutting syllabus — the date or the hours has to move.`
      : dropped.length === 0 ? 'Nothing to drop.' : undefined,
    receipts: [
      baseReceipt,
      `At ${dHours} hrs/day × ${daysToTarget} days you have ${Math.round(budget)} hrs — short by ${Math.round(Math.max(0, gap))} hrs`,
      dropped.length ? `Dropping ${dropped.length} topics (weightage ≤${DROPPABLE_MAX_WEIGHTAGE}) frees ${droppedHours} hrs: ${dropped.join(', ')}` : '',
      'High-weightage topics are never dropped.',
    ].filter(Boolean),
  });

  const firstFeasible = (['balanced', 'keep_hours', 'keep_date', 'cut_scope'] as ReplanOptionKind[])
    .find((k) => options.find((o) => o.kind === k)?.feasible) ?? null;

  return {
    onTrack: false,
    remainingSyllabusHours: syllabus, mockCount, mockHours, totalHoursNeeded,
    daysToTarget, requiredPerDay, committedPerDay, pacePerDay, paceSource,
    options, recommended: firstFeasible,
    headline:
      `${pretty(iso(targetDate))} needs ${requiredPerDay} hrs/day` +
      (paceSource === 'observed'
        ? `. You are averaging ${pacePerDay}${committedPerDay != null && committedPerDay > (pacePerDay ?? 0) ? ` (you'd planned ${committedPerDay})` : ''}.`
        : committedPerDay != null ? `, and you planned ${committedPerDay}.` : '.'),
  };
}
