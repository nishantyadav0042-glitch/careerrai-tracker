import { buildWeekPlan, type DayPlan } from './study-forecast';
import { remainingSyllabusHours, MOCK_HOURS_EACH, type TopicStatusRow } from './study-pace';
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
  mockHours: number;
  totalHours: number;
  daysToExam: number;
  /** Hours/day needed to finish everything, if they studied every single day. */
  requiredPerDay: number;
  committedPerDay: number | null;
  /** Days their own hours actually need. */
  daysNeeded: number | null;
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

/** How many mocks the week containing `date` should carry. */
export function mocksForWeekOf(date: Date, exam: Date): number {
  return phaseOn(date, exam) === 'build' ? MOCKS_PER_WEEK.build : MOCKS_PER_WEEK.intensive;
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

  // Topics laid into days by the existing scheduler. Mock days are NOT excluded
  // from its capacity — the overlay below takes the day over, and a student who
  // wants both can still do both.
  const topicDays: DayPlan[] = buildWeekPlan(
    input.coverage, input.weekdayHours, input.today, input.effort, span, null,
  );
  const topicsByDate = new Map(topicDays.map((d) => [d.iso, d]));

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
      for (const it of topicsByDate.get(key)?.items ?? []) {
        items.push({ kind: 'topic', label: it.topic, section: it.section, hours: it.hours });
      }
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
  const daysNeeded = committed ? Math.ceil(totalHours / committed) : null;

  return {
    days,
    examDate: iso(exam),
    mockCount,
    feasibility: {
      syllabusHours,
      mockHours,
      totalHours,
      daysToExam,
      requiredPerDay: Math.round((totalHours / daysToExam) * 10) / 10,
      committedPerDay: committed,
      daysNeeded,
      fits: daysNeeded == null ? true : daysNeeded <= daysToExam,
      daysOver: daysNeeded == null ? 0 : Math.max(0, daysNeeded - daysToExam),
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
    return `${f.totalHours}h of work left and ${f.daysToExam} days — that is ${f.requiredPerDay}h a day. Set your study hours and we will tell you if it fits.`;
  }
  if (f.fits) {
    const spare = f.daysToExam - (f.daysNeeded ?? 0);
    return `At ${f.committedPerDay}h a day you finish ${spare} day${spare === 1 ? '' : 's'} before CAT. ${f.totalHours}h left, including ${f.mockHours}h of mocks.`;
  }
  return `At ${f.committedPerDay}h a day you finish ${f.daysOver} day${f.daysOver === 1 ? '' : 's'} AFTER CAT. You need ${f.requiredPerDay}h a day, or fewer topics. Nothing here is hidden — pick one and we will rebuild the plan.`;
}
