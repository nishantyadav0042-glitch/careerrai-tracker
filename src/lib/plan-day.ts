import {
  generateRoutine, getPhase,
  type RoutineProfile, type Section, type Stage, type Phase, type RoutineTask,
} from './routine-engine';
import { buildTopicChoices, type DayTopicHistory } from './day-topics';
import { timetableDayTasks } from './timetable-day';
import { coachingTopicsForDate } from './timetable-month';
import { resolveFocusSections, type FocusSections } from './focus-sections';
import { dailyHours } from './daily-hours';
import type { TimetableBlock } from './timetable';
import type { DebriefRow } from './mock-informed-focus';

// ── ONE DAY-BUILDER, FOR BOTH WRITERS ───────────────────────────────────────
//
// Founder, 14 Aug: "For identical student state, all study plan generation
// paths must produce the same canonical plan. Not just the same weakest
// section — the whole plan. Always identical."
//
// daily_routines has exactly two writers: the tracker route
// (api/routine/today) and the notification cron (lib/routine-plan). Until now
// each assembled the day itself from shared parts. Every individual part was
// shared — focus, timetable, topic choices, the engine — but the ASSEMBLY was
// written twice, and that is where the two-writer bug lived: the cron's focus
// chain silently lacked a mock branch for weeks, and nothing could see it
// because both plans looked reasonable on their own.
//
// Sharing the parts is not enough. Two functions that call the same five
// helpers in the same order today will drift the first time someone edits one
// of them. So the assembly itself is now one function, and a guard test pins
// that neither writer calls the engine or the topic selector directly.
//
// WHAT STAYS OUTSIDE. Fetching, freshness (planStaleReason) and persistence
// stay with each caller: the route must answer a live request and the cron
// runs in a batch, and those genuinely differ. What must not differ — what a
// student's day CONTAINS — is entirely in here.
//
// Verified before extracting, not assumed: buildTopicChoices reads exactly the
// three fields plannerRecency produces (daysSinceLastPracticedByTopic,
// daysSincePlannedByTopic, postponedTopics) and generateRoutine reads only the
// per-section daysSinceLastPracticed. Both writers already supplied all four
// identically; the extra fields in the route's history feed the Mission engine
// and the UI, never the plan. So this extraction changes no student's plan
// today — it makes tomorrow's divergence impossible instead of unlikely.

export interface DayPlanInput {
  /** The raw profiles row. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any;
  coverageRows: { section: string; topic: string; status: string; is_priority?: boolean | null }[];
  debriefRows: DebriefRow[];
  timetableRow: { blocks?: unknown; confirmed_at?: string | null } | null;
  history: DayTopicHistory;
  /** The student's study day (getLogDateString) — never a raw UTC date. */
  today: string;
  now: Date;
}

export interface DayPlanResult {
  phase: Phase;
  tasks: RoutineTask[];
  estMinutes: number;
  /** The hours this day was built to — persisted so staleness can be judged. */
  hoursToday: number;
  routineProfile: RoutineProfile;
  focus: FocusSections;
  todayClassTopics: string[];
  daysToTarget: number | null;
  /** True when an uploaded timetable owned the day and the engine never ran. */
  fromTimetable: boolean;
}

/**
 * The hours today is built to.
 *
 * Weekday/weekend comes from the STUDY DAY, not from a server-local weekday.
 * Since the study day rolls at 05:30 IST — exactly 00:00 UTC — the study day
 * string and the UTC date are the same, so parsing it gives the right weekday
 * on any host. Reading `new Date().getDay()` on a UTC server was correct only
 * by coincidence and would break the moment the host timezone changed.
 */
export function hoursForStudyDay(profile: RoutineProfile, todayIso: string): number {
  const dow = new Date(todayIso + 'T00:00:00Z').getUTCDay();
  const weekend = dow === 0 || dow === 6;
  return (weekend ? profile.weekendHours : profile.weekdayHours)
    ?? (weekend
      ? (profile.isWorkingProfessional ? 4 : 3)
      : (profile.isWorkingProfessional ? 1.5 : 2.5));
}

/** The profile the engine plans against, mapped in ONE place. */
export function toRoutineProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any,
  focus: FocusSections,
): RoutineProfile {
  const hours = dailyHours(profile);
  return {
    isWorkingProfessional: !!profile.is_working_professional,
    isRepeater: !!profile.is_repeater,
    targetPercentile: profile.target_percentile as number | null,
    // THE STUDENT'S OWN HOURS, through lib/daily-hours — the one module that
    // owns this number for the whole app. Nothing derives it from behaviour or
    // from the finish date; falling behind moves the DATE, never the hours.
    weekdayHours: hours.weekday,
    weekendHours: hours.weekend,
    weakestSection: focus.weakest,
    strongestSection: focus.strongest,
    weakTopic: (profile.self_reported_weak_topic as string | null) || null,
    currentStage: (profile.current_stage as Stage | null) ?? null,
    attemptYear: profile.attempt_year as number | null,
  } as RoutineProfile;
}

/**
 * What this student's day contains. The ONE assembly both writers use.
 *
 * The only permitted fork is the student's own uploaded timetable, and it
 * REPLACES the generated day rather than competing with it (lib/timetable-day)
 * — the "one study plan per student" rule.
 */
export function buildDayPlan(input: DayPlanInput): DayPlanResult {
  const { profile, coverageRows, debriefRows, timetableRow, history, today, now } = input;

  const focus = resolveFocusSections(profile, coverageRows, debriefRows, today);
  const routineProfile = toRoutineProfile(profile, focus);
  const hoursToday = hoursForStudyDay(routineProfile, today);
  const phase = getPhase(now, routineProfile.attemptYear, routineProfile.currentStage, routineProfile.isRepeater);

  const blocks = (timetableRow?.blocks as TimetableBlock[] | null) ?? null;
  const confirmedAt = (timetableRow?.confirmed_at as string | null) ?? null;
  const planSource = profile.plan_source as string | null;

  // An uploaded sheet owns the day outright.
  const timetableTasks = timetableDayTasks({
    planSource, blocks, confirmedAt, todayIso: today, dayMinutes: hoursToday * 60, phase,
  });
  if (timetableTasks) {
    return {
      phase, tasks: timetableTasks,
      estMinutes: timetableTasks.reduce((s, t) => s + t.estMinutes, 0),
      hoursToday, routineProfile, focus,
      todayClassTopics: [], daysToTarget: null, fromTimetable: true,
    };
  }

  // Otherwise the engine plans, with today's class as a decisive signal.
  const todayClassTopics = planSource === 'coaching'
    ? coachingTopicsForDate(blocks ?? [], confirmedAt, today)
    : [];
  const targetIso = profile.syllabus_target_date as string | null;
  const daysToTarget = targetIso
    ? Math.round((Date.parse(targetIso) - Date.parse(today)) / 86_400_000)
    : null;

  const choices = buildTopicChoices(
    coverageRows, routineProfile, history,
    (profile.start_with as string | null) ?? null,
    todayClassTopics, daysToTarget, now,
  );
  const generated = generateRoutine(routineProfile, now, history, choices.choices, choices.extras);

  return {
    phase: generated.phase,
    tasks: generated.tasks,
    estMinutes: generated.estMinutes,
    hoursToday, routineProfile, focus, todayClassTopics, daysToTarget,
    fromTimetable: false,
  };
}

export type { Section };
