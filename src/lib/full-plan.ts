import { remainingSyllabusHours, MOCK_HOURS_EACH, totalSyllabusHours, type TopicStatusRow } from './study-pace';
import { catExamDate, type Phase } from './routine-engine';
import type { Section } from './prep-model';
import { projectPlan, type ProjectionDay } from './plan-projection';

// ── The whole plan, today to CAT day ────────────────────────────────────────
//
// Founder, 8 Aug: every student should be able to open the app and see their
// entire plan — "I want to check what my next fifteen days look like." For a
// self-prep student that runs to CAT day; for a coaching student it runs to the
// end of the month they uploaded. Revision is part of it, and there is one
// complete mock every week without a second thought.
//
// THIS FILE SCHEDULES NOTHING ITSELF. Topics are laid into days by
// plan-projection.projectPlan, which is the SAME authority Home and the
// notification cron run — chooseSectionDay for the choice, dayShape for the
// split — walked forward one day at a time. What this file adds is the EXAM
// CALENDAR on top: mock slots, their analysis, and the phase rules.
//
// Until 11 Aug this file ordered its topics with study-forecast.buildWeekPlan
// instead: a second scorer, with its own queue and its own bin-packing. The
// comment here said it was "used for ORDER, not for day assignment" and warned
// about the two-models trap — and the trap had already sprung. The same
// Tuesday rendered as three tasks on Home and five, with different topics, on
// the Whole Plan. There is now one planner and three views of it.
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

/** A full revision block when the day has room for it. */
export const REVISION_HOURS = 1.5;

/**
 * Below this, the block is dropped instead of shrunk.
 *
 * A 15-minute "revise your weakest area" is not revision; it is a line on a
 * screen that makes the day look fuller than it is.
 */
export const MIN_REVISION_HOURS = 0.5;

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
  /**
   * The student's weakest section — the same value the daily plan uses, so the
   * mix leans the same way on both. Optional: derived from remaining hours when
   * absent, but the caller SHOULD pass it to keep the two views identical.
   */
  weakestSection?: Section;
  /** Cap the horizon (a coaching student's month). Null = run to exam day. */
  horizonDays?: number | null;
  /**
   * Coaching only: what their institute teaches, keyed by date.
   *
   * Founder's rule: the topics in the photo must appear on the SAME date the
   * coaching teaches them, so the student can hold their sheet next to our plan
   * and see them agree. Without this the plan was built from our own ordering
   * and then checked against their sheet — which is a check designed to fail,
   * and it did: every coaching student who opened their full plan saw
   * "20 topics are not on the date your coaching teaches them."
   */
  coachingByDate?: Record<string, string[]>;
  /**
   * Calendar days from today to the student's chosen syllabus-finish date.
   *
   * The same number Home's plan is paced against (profiles.syllabus_target_date),
   * so the syllabus clock runs at the same speed on both surfaces. Null when
   * they never set one — the clock then holds its one-block-a-day floor.
   */
  daysToSyllabusTarget?: number | null;
  /** Topics the student starred in the Preparation Map, as Home sees them. */
  priorityTopics?: string[];
  /**
   * The planner's memory — the same three signals Home is fed (plan-history).
   *
   * Without them the Whole Plan ran the right authority on the wrong inputs:
   * on 11 Aug, for the same student on the same morning, Home's second QA block
   * was Inequalities and the Whole Plan's was Percentages, purely because the
   * Whole Plan did not know Percentages had been on yesterday's plan.
   */
  daysSincePlannedByTopic?: Record<string, number | null>;
  daysSinceLastPracticedByTopic?: Record<string, number | null>;
  postponedTopics?: string[];
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

  // ── THE ONE PLANNER, walked forward ─────────────────────────────────────────
  //
  // Every topic block below comes from projectPlan — the same chooseSectionDay
  // (syllabus clock + memory clock) and the same dayShape that build Home. This
  // file hands it the capacity the exam calendar left, and the coaching dates
  // that must be honoured, and gets back the days.
  //
  // Coaching class topics are no longer anchored by a separate pass here: they
  // travel into the projection as `classTopics`, where they become the same
  // `todayClassBonus` claim Home already honours. One mechanism, both surfaces.
  const projectionDays: ProjectionDay[] = [];
  for (let d = 0; d < span; d++) {
    const date = new Date(input.today.getTime() + d * DAY_MS);
    const key = iso(date);
    const planPhase = phaseOn(date, exam);
    projectionDays.push({
      date: key,
      // November places no new topics at all — the one rule every source states.
      capacityHours: planPhase === 'revision' ? 0 : (capacityByDate.get(key) ?? 0),
      classTopics: input.coachingByDate?.[key],
      weekend: date.getUTCDay() === 0 || date.getUTCDay() === 6,
      phase: (planPhase === 'build' ? 'foundation' : planPhase) as Phase,
    });
  }

  const projected = projectPlan({
    days: projectionDays,
    coverage: input.coverage,
    effort: input.effort,
    weakestSection: input.weakestSection ?? null,
    daysToSyllabusTarget: input.daysToSyllabusTarget ?? null,
    priorityTopics: input.priorityTopics,
    daysSincePlannedByTopic: input.daysSincePlannedByTopic,
    daysSinceLastPracticedByTopic: input.daysSinceLastPracticedByTopic,
    postponedTopics: input.postponedTopics,
  });

  const topicsByDate = new Map<string, PlanItem[]>();
  for (const day of projected) {
    if (!day.items.length) continue;
    topicsByDate.set(day.date, day.items.map((i) => ({
      kind: 'topic' as const, label: i.topic, section: i.section, hours: i.hours,
    })));
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
      // Revision takes what is LEFT of the day, never a fixed 1.5h on top.
      //
      // The bug this fixes, measured 9 Aug: a mock is 2h and its analysis is
      // 2h, and revision was appended at a flat 1.5h regardless. A student who
      // committed 2h/day was handed 3.5h days — sixteen of them — and a 3h
      // student the same. It was invisible at 4h/day and above, which is where
      // every earlier check happened to look.
      //
      // A plan that quietly demands 75% more than the student agreed to breaks
      // the exact promise the hours question exists to keep. Below the floor
      // the block is dropped rather than shrunk into something useless:
      // fifteen minutes of "revise your weakest area" is not revision, it is a
      // line on a screen.
      const committedToday = input.weekdayHours && input.weekdayHours > 0 ? input.weekdayHours : null;
      const usedSoFar = items.reduce((s, i) => s + i.hours, 0);
      const room = committedToday == null ? REVISION_HOURS : committedToday - usedSoFar;
      const revisionHours = Math.min(REVISION_HOURS, Math.round(room * 2) / 2);

      if (revisionHours >= MIN_REVISION_HOURS) {
        const topic = revisionQueue.shift();
        items.push({
          kind: 'revision',
          label: topic ? `Revise ${topic}` : 'Revise your weakest area',
          section: null,
          hours: revisionHours,
        });
      }
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
