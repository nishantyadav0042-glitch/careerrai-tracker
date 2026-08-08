import { buildWeekPlan, type DayPlan } from './study-forecast';
import { remainingSyllabusHours, MOCK_HOURS_EACH, totalSyllabusHours, type TopicStatusRow } from './study-pace';
import { catExamDate } from './routine-engine';

// ── The whole plan, today to CAT day ────────────────────────────────────────
//
// Founder, 8 Aug: every student should be able to open the app and see their
// entire plan — "I want to check what my next fifteen days look like." For a
// self-prep student that runs to CAT day; for a coaching student it runs to the
// end of the month they uploaded. Revision is part of it, and there is one
// complete mock every week without a second thought.
//
// THIS FILE SCHEDULES NOTHING ITSELF. Topics are laid into days by
// buildWeekPlan, which is the same function the Blueprint's 7-day view already
// uses — extended from 7 days to the full runway. Writing a second topic
// scheduler here is exactly the two-models trap that produced the 230h/397h
// split this codebase has already paid for once. What this file adds is the
// EXAM CALENDAR on top: mock slots, their analysis, and the phase rules.
//
// The research behind the numbers is in docs/SELFPREP-PLAN-RESEARCH-2026-08.md.
// Six sources agree that mocks start 3-4 months out and ramp as the exam nears;
// that analysis time should equal or exceed exam time; that revision begins two
// months out; and that no new topic should be started in the final month.

const DAY_MS = 86_400_000;

/** Mocks per week, by how close the exam is. Founder-approved, 8 Aug. */
export const MOCKS_PER_WEEK = {
  /** Now through September. The floor: "one complete mock every week." */
  build: 1,
  /** October and November. Two, not three — the founder's call: three a week
   *  leaves no room to act on what the analysis found. */
  intensive: 2,
} as const;

/** A mock is 2h of exam + ~2h of honest analysis. Priced once, in study-pace. */
export { MOCK_HOURS_EACH };

/** Analysis is scheduled as its own block the NEXT day, never bundled in. */
export const MOCK_ANALYSIS_HOURS = 2;

export type PlanPhase = 'build' | 'intensive' | 'revision';

export interface PlanItem {
  kind: 'topic' | 'revision' | 'mock' | 'mock_analysis';
  label: string;
  section: string | null;
  hours: number;
}

export interface FullPlanDay {
  date: string;              // YYYY-MM-DD
  phase: PlanPhase;
  items: PlanItem[];
  totalHours: number;
  isMockDay: boolean;
}

export interface Feasibility {
  syllabusHours: number;
  /** The whole syllabus at this student's effort — the ring's denominator. */
  syllabusTotalHours: number;
  /** Share of the syllabus already behind them, 0-100. */
  syllabusDonePct: number;
  mockHours: number;
  totalHours: number;
  daysToExam: number;
  /** Hours/day needed to finish everything, if they studied every single day. */
  requiredPerDay: number;
  committedPerDay: number | null;
  /** Days their own hours actually need, at topic capacity. */
  daysNeeded: number | null;
  /** Days actually free for topic work — not mock, analysis or November. */
  topicDaysAvailable: number;
  /** Hours of topic work those days can hold at the student's own pace. */
  topicCapacityHours: number | null;
  fits: boolean;
  /** How many days past the exam they land. 0 when it fits. */
  daysOver: number;
}

export interface FullPlanInput {
  coverage: TopicStatusRow[];
  effort: number;                 // studentEffortMultiplier — required, never defaulted
  weekdayHours: number | null;
  today: Date;
  attemptYear: number | null;
  /** Revision-overdue topics, most overdue first. Surfaced, not recomputed. */
  revisionDue?: string[];
  /** Cap the horizon (a coaching student's month). Null = run to exam day. */
  horizonDays?: number | null;
}

export interface FullPlan {
  days: FullPlanDay[];
  feasibility: Feasibility;
  examDate: string;
  mockCount: number;
}

function iso(d: Date): string { return d.toISOString().slice(0, 10); }

/**
 * Which phase a date falls in.
 *
 * September and October are "intensive" and November is "revision", matching
 * getPhase() in routine-engine so the long view and the daily plan can never
 * disagree about what season it is.
 */
export function phaseOn(date: Date, exam: Date): PlanPhase {
  if (date.getFullYear() === exam.getFullYear()) {
    const m = date.getMonth();
    if (m === 10) return 'revision';        // November, to exam day
    if (m === 8 || m === 9) return 'intensive'; // September, October
  }
  return 'build';
}

/**
 * How many mocks the week containing `date` should carry.
 *
 * Keyed on the MONTH, not on phaseOn — the study phase and the mock cadence
 * are different things and conflating them silently put September on two
 * mocks a week. The founder's rule is October and November: "two a week is
 * right; three is too many."
 */
export function mocksForWeekOf(date: Date, exam: Date): number {
  const sameYear = date.getFullYear() === exam.getFullYear();
  const m = date.getMonth();
  return sameYear && (m === 9 || m === 10) ? MOCKS_PER_WEEK.intensive : MOCKS_PER_WEEK.build;
}

/**
 * Is this a mock day?
 *
 * Sunday always — a full mock needs an unbroken two hours plus analysis, and a
 * weekday evening is where good intentions go to die. The second mock, once
 * October starts, goes on Wednesday: far enough from Sunday that the analysis
 * of one is done before the next begins, which is the entire point of two.
 */
export function isMockDay(date: Date, exam: Date): boolean {
  if (date > exam) return false;
  const dow = date.getUTCDay(); // 0 = Sunday
  const perWeek = mocksForWeekOf(date, exam);
  if (dow === 0) return true;
  return perWeek >= 2 && dow === 3; // Wednesday
}

/**
 * The whole plan, day by day.
 *
 * Deliberately built from the SAME inputs the daily plan uses, so a student who
 * scrolls to next Tuesday and then arrives on Tuesday sees the same work. The
 * one thing this cannot promise is exact topic identity three weeks out —
 * coverage changes as they study, and a plan that pretended otherwise would be
 * lying. It promises the shape: this much work, these phases, these mocks.
 */
export function buildFullPlan(input: FullPlanInput): FullPlan {
  const exam = catExamDate(input.attemptYear ?? input.today.getFullYear());
  const daysToExam = Math.max(1, Math.round((exam.getTime() - input.today.getTime()) / DAY_MS));
  const span = input.horizonDays != null ? Math.min(input.horizonDays, daysToExam) : daysToExam;

  const syllabusHours = remainingSyllabusHours(input.coverage, input.effort);

  // Count the mock slots first — they consume real hours and the feasibility
  // verdict is a lie without them.
  let mockCount = 0;
  for (let d = 0; d < span; d++) {
    if (isMockDay(new Date(input.today.getTime() + d * DAY_MS), exam)) mockCount++;
  }
  const mockHours = mockCount * MOCK_HOURS_EACH;

  // Hours each day owes to the exam calendar before any topic can be placed.
  // A mock day owes 2h to the mock; the day after owes 2h to its analysis.
  // Reserving the WHOLE day was the first attempt and it was too blunt — a
  // student with six hours still has four left after a mock.
  const reservedOn = (date: Date): number =>
    (isMockDay(date, exam) ? 2 : 0) +
    (isMockDay(new Date(date.getTime() - DAY_MS), exam) ? MOCK_ANALYSIS_HOURS : 0);

  // Topic capacity, day by day, honestly: what the student has, minus what the
  // exam calendar already claimed. November is zero — no new topics.
  const committedDaily = input.weekdayHours && input.weekdayHours > 0 ? input.weekdayHours : 4;
  const capacityByDate = new Map<string, number>();
  let topicCapacityTotal = 0;
  let topicDaysAvailable = 0;
  // The reservation on each usable day, kept so the required-pace answer below
  // can be solved against the same structure rather than estimated from it.
  const reservations: number[] = [];
  for (let d = 0; d < span; d++) {
    const date = new Date(input.today.getTime() + d * DAY_MS);
    const isRevision = phaseOn(date, exam) === 'revision';
    const free = isRevision ? 0 : Math.max(0, committedDaily - reservedOn(date));
    if (!isRevision) reservations.push(reservedOn(date));
    capacityByDate.set(iso(date), free);
    topicCapacityTotal += free;
    if (free > 0) topicDaysAvailable++;
  }

  // The daily hours that would ACTUALLY clear the syllabus, solved against the
  // real day structure. Dividing the syllabus by free days gave "3.9h a day
  // would clear it" to a student already doing 4h and still 54 hours short —
  // because that division ignored the hours mock days give up. Solved in half
  // hours, which is the granularity the app stores anyway.
  const capacityAt = (h: number) => reservations.reduce((sum, r) => sum + Math.max(0, h - r), 0);
  let solvedPerDay = committedDaily;
  for (let h = 0.5; h <= 16; h += 0.5) {
    if (capacityAt(h) >= syllabusHours) { solvedPerDay = h; break; }
    solvedPerDay = 16;
  }

  // buildWeekPlan is used for ORDER, not for day assignment: it decides which
  // topic comes next (coverage, weightage, prerequisites, effort) and how many
  // hours each needs. The re-flow below then pours that queue into the real
  // capacity above. A second scoring model here would be the two-models trap.
  const ordered: PlanItem[] = buildWeekPlan(
    input.coverage, committedDaily, input.today, input.effort,
    Math.max(1, Math.ceil(topicCapacityTotal / committedDaily)), null,
  ).flatMap((d: DayPlan) => d.items.map((i) => ({
    kind: 'topic' as const, label: i.topic, section: i.section, hours: i.hours,
  })));

  // A topic may SPAN days, which is both realistic (Reading Comprehension is
  // 30 hours; nobody does it in one sitting) and necessary. The first version
  // refused to start a 3-hour topic with 2 hours left, wasting the remainder —
  // over 85 days that fragmentation alone dropped five topics off a plan whose
  // hours said it fitted. A plan whose own arithmetic disagrees with its own
  // calendar is exactly what this whole day has been about removing.
  const topicsByDate = new Map<string, PlanItem[]>();
  let qi = 0;
  let leftOnItem = ordered.length ? ordered[0].hours : 0;
  for (let d = 0; d < span && qi < ordered.length; d++) {
    const key = iso(new Date(input.today.getTime() + d * DAY_MS));
    let left = capacityByDate.get(key) ?? 0;
    const items: PlanItem[] = [];
    while (qi < ordered.length && left >= 0.5) {
      const take = Math.min(leftOnItem, left);
      if (take >= 0.5) {
        items.push({ ...ordered[qi], hours: Math.round(take * 2) / 2 });
        left -= take;
        leftOnItem -= take;
      }
      if (leftOnItem < 0.5) { qi++; leftOnItem = qi < ordered.length ? ordered[qi].hours : 0; }
      if (take < 0.5) break;
    }
    if (items.length) topicsByDate.set(key, items);
  }

  const revisionQueue = [...(input.revisionDue ?? [])];
  const days: FullPlanDay[] = [];

  for (let d = 0; d < span; d++) {
    const date = new Date(input.today.getTime() + d * DAY_MS);
    const key = iso(date);
    const phase = phaseOn(date, exam);
    const mockToday = isMockDay(date, exam);
    const analysisToday = isMockDay(new Date(date.getTime() - DAY_MS), exam);
    const items: PlanItem[] = [];

    if (mockToday) {
      items.push({ kind: 'mock', label: 'Full mock', section: null, hours: 2 });
    }
    if (analysisToday) {
      // Its own block, the day after, because every source in the research says
      // the analysis is where the improvement is — and an unscheduled four-hour
      // job is a job that does not happen.
      items.push({
        kind: 'mock_analysis', label: "Analyse yesterday's mock", section: null,
        hours: MOCK_ANALYSIS_HOURS,
      });
    }

    // From November, no new topics. Revision, mocks and strengthening only —
    // the one rule every source in the research states outright.
    if (phase === 'revision') {
      const topic = revisionQueue.shift();
      if (topic) items.push({ kind: 'revision', label: `Revise ${topic}`, section: null, hours: 1.5 });
      else items.push({ kind: 'revision', label: 'Revise your weakest area', section: null, hours: 1.5 });
    } else {
      for (const it of topicsByDate.get(key) ?? []) items.push(it);
    }

    days.push({
      date: key,
      phase,
      items,
      totalHours: Math.round(items.reduce((s, i) => s + i.hours, 0) * 2) / 2,
      isMockDay: mockToday,
    });
  }

  const totalHours = syllabusHours + mockHours;
  const committed = input.weekdayHours && input.weekdayHours > 0 ? input.weekdayHours : null;

  // Feasibility measured against the days topics can ACTUALLY use — not the
  // raw calendar. Dividing total work by every day to the exam counts mock
  // days, analysis days and November as if they were free for new topics, and
  // they are not. That version said 4.5h/day was enough while the scheduler
  // was quietly dropping eighteen topics; the two now answer with one number.
  const topicCapacityHours = Math.round(topicCapacityTotal);
  // Days needed must be measured in the SAME currency as capacity. Dividing
  // the syllabus by raw daily hours ignored the hours the exam calendar had
  // already taken, which produced "you run out of days 0 short" on a plan that
  // was 54 hours short — a sentence that is both wrong and meaningless.
  const shortfallHours = Math.max(0, syllabusHours - topicCapacityHours);
  const daysNeeded = committed
    ? topicDaysAvailable + Math.ceil(shortfallHours / committed)
    : null;
  const fits = committed == null ? true : shortfallHours === 0;
  const syllabusTotalHours = Math.round(totalSyllabusHours() * input.effort);

  return {
    days,
    examDate: iso(exam),
    mockCount,
    feasibility: {
      syllabusHours,
      syllabusTotalHours,
      syllabusDonePct: syllabusTotalHours > 0
        ? Math.max(0, Math.min(100, Math.round((1 - syllabusHours / syllabusTotalHours) * 100)))
        : 0,
      mockHours,
      totalHours,
      daysToExam,
      requiredPerDay: solvedPerDay,
      committedPerDay: committed,
      daysNeeded,
      topicDaysAvailable,
      topicCapacityHours,
      fits,
      daysOver: daysNeeded == null ? 0 : Math.max(0, daysNeeded - topicDaysAvailable),
    },
  };
}

/**
 * The one-line verdict, in the student's own numbers.
 *
 * Founder's call, 8 Aug: when the date cannot be hit we SAY SO, with the two
 * real fixes beside it. The alternative — quietly dropping low-weightage topics
 * until the arithmetic works — is where a planner starts lying, and a student
 * who finds out in November has lost the months in which they could have acted.
 */
export function feasibilityLine(f: Feasibility): string {
  if (f.committedPerDay == null) {
    return `${f.syllabusHours}h of syllabus and ${f.mockHours}h of mocks left, across ${f.topicDaysAvailable} free study days — about ${f.requiredPerDay}h a day. Set your study hours and we will tell you if it fits.`;
  }
  if (f.fits) {
    const spare = f.topicDaysAvailable - (f.daysNeeded ?? 0);
    return `At ${f.committedPerDay}h a day the whole syllabus fits, with ${spare} study day${spare === 1 ? '' : 's'} to spare — and that is after setting aside ${f.mockHours}h for mocks and all of November for revision.`;
  }
  const short = f.syllabusHours - (f.topicCapacityHours ?? 0);
  return `You are ${short}h short. Your ${f.topicDaysAvailable} free study days hold ${f.topicCapacityHours}h at ${f.committedPerDay}h a day — mocks and November are already set aside — and the syllabus needs ${f.syllabusHours}h. About ${f.requiredPerDay}h a day would clear it, or ${f.daysOver} more days than you have.`;
}
