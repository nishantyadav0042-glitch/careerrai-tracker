// Shared "today's plan" computation for consumers OUTSIDE the tracker request
// — chiefly the Study Companion notification cron, which needs to name the
// student's actual topic ("Geometry today, RC next") instead of only their
// weakest *section*.
//
// It deliberately mirrors the read-or-generate logic in
// src/app/api/routine/today/route.ts so a notification sent at 09:30 names the
// SAME plan the student sees when they open the app minutes later — same
// topics, same order, no flicker. The pure engine (generateRoutine,
// chooseTopicForSection, the topic constants) is imported and shared; only the
// thin DB-wiring helper buildHistory is duplicated here.
//
// buildTopicChoices is NOT duplicated any more. It used to be, "kept in lockstep
// by this comment", and the comment lost: this copy had silently dropped
// revisionSeason, so from 1 September the notification would have named
// different topics than the plan it had just written. Both callers now import
// lib/day-topics — one implementation, no lockstep to maintain.

import {
  generateRoutine,
  getPhase,
  type RoutineProfile,
  type Section,
  type Stage,
  type HistoryInput,
} from '@/lib/routine-engine';
import { timetableDayTasks } from '@/lib/timetable-day';
import { buildTopicChoices } from '@/lib/day-topics';
import { plannerRecency } from '@/lib/plan-history';
import { dailyHours } from '@/lib/daily-hours';
import { coachingTopicsForDate } from '@/lib/timetable-month';
import type { TimetableBlock } from '@/lib/timetable';
import { planStaleReason } from '@/lib/plan-freshness';
import { getLogDateString } from '@/lib/streak-utils';
import { weakestFromCoverage } from '@/lib/section-weakness';

// One studyable step in the day's plan, with completion state merged in.
export interface PlanTask {
  id: string;
  section: Section | 'General';
  topic: string | null;
  label: string;
  target: string | null;
  estMinutes: number;
  done: boolean;
}

// The compact shape notification copy consumes. `null` from computeTodaysPlan
// means "no usable plan" (unonboarded / engine error) — callers fall back to
// section-level copy.
export interface TodaysPlan {
  date: string;
  phase: string;
  tasks: PlanTask[];
  // Tasks that name a concrete topic (excludes general mock/revision blocks) —
  // this is what the "study X, then Y" copy walks.
  topicTasks: PlanTask[];
  firstTask: PlanTask | null;   // the day's lead (priority) task
  nextTask: PlanTask | null;    // first not-yet-done task (topic-bearing preferred)
  doneCount: number;
  totalCount: number;
  allDone: boolean;
  /**
   * Topics the student's coaching teaches TODAY, from the anchored month.
   * Empty for everyone not following a coaching plan. Carried on the plan so a
   * notification can say WHY today leads where it does — a coaching student
   * reading "Percentages, because that is today's class" is being told
   * something they can verify, which is the whole difference between a
   * reminder and a manager's update.
   */
  classTopics: string[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mirrors buildHistory in today/route.ts. Reads the last 14 routines + recent
// completions to derive per-topic recency (feeds the Topic Selector) and the
// most recent day's swapped-out topics ("never delete, always postpone").
async function buildHistory(admin: any, studentId: string): Promise<
  HistoryInput & {
    daysSinceLastPracticedByTopic: Record<string, number | null>;
    daysSincePlannedByTopic: Record<string, number | null>;
    postponedTopics: string[];
  }
> {
  const [{ data: pastRoutines }, { data: pastCompletions }] = await Promise.all([
    admin
      .from('daily_routines')
      .select('routine_date, tasks, swapped_out')
      .eq('student_id', studentId)
      .order('routine_date', { ascending: false })
      .limit(14),
    admin
      .from('routine_task_completions')
      .select('routine_date, task_id')
      .eq('student_id', studentId)
      .order('routine_date', { ascending: false })
      .limit(200),
  ]);

  // The three planner signals come from the ONE implementation (plan-history),
  // so Home, the notification cron and the Whole Plan are fed identically.
  const recency = plannerRecency(pastRoutines ?? [], pastCompletions ?? [], getLogDateString());

  // The per-SECTION recency below is a coarser signal, used by the Mission
  // Engine rather than the Topic Selector, so it stays here.
  const today = getLogDateString();
  const completedByDate = new Map<string, Set<string>>();
  for (const c of pastCompletions ?? []) {
    if (!completedByDate.has(c.routine_date)) completedByDate.set(c.routine_date, new Set());
    completedByDate.get(c.routine_date)!.add(c.task_id);
  }
  const daysSince: Record<Section, number | null> = { VARC: null, DILR: null, QA: null };
  for (const r of pastRoutines ?? []) {
    const completedTaskIds = completedByDate.get(r.routine_date) ?? new Set();
    const daysAgo = Math.round((Date.parse(today) - Date.parse(r.routine_date)) / 86_400_000);
    for (const t of (Array.isArray(r.tasks) ? (r.tasks as any[]) : [])) {
      if (!completedTaskIds.has(t.id)) continue;
      const section = t.section as Section;
      if (['VARC', 'DILR', 'QA'].includes(section) && daysSince[section] == null) daysSince[section] = daysAgo;
    }
  }
  return { daysSinceLastPracticed: daysSince, ...recency };
}

function weakestFromBaseline(p: { baseline_varc: unknown; baseline_dilr: unknown; baseline_qa: unknown }): Section | null {
  const scores = [
    { s: 'VARC' as const, v: p.baseline_varc as number | null },
    { s: 'DILR' as const, v: p.baseline_dilr as number | null },
    { s: 'QA' as const, v: p.baseline_qa as number | null },
  ].filter((x): x is { s: Section; v: number } => x.v != null);
  if (scores.length < 2) return null;
  return scores.reduce((a, b) => (b.v < a.v ? b : a)).s;
}

function strongestFromBaseline(p: { baseline_varc: unknown; baseline_dilr: unknown; baseline_qa: unknown }): Section | null {
  const scores = [
    { s: 'VARC' as const, v: p.baseline_varc as number | null },
    { s: 'DILR' as const, v: p.baseline_dilr as number | null },
    { s: 'QA' as const, v: p.baseline_qa as number | null },
  ].filter((x): x is { s: Section; v: number } => x.v != null);
  if (scores.length < 2) return null;
  return scores.reduce((a, b) => (b.v > a.v ? b : a)).s;
}

// Reads (generating + persisting on first touch of the day, exactly like the
// tracker) the student's routine for today, then merges in which tasks are
// already ticked. Returns null when there's no usable plan (no profile, or the
// engine throws) so the caller can fall back to generic copy. Never throws.
export async function computeTodaysPlan(
  admin: any,
  studentId: string,
  now: Date = new Date()
): Promise<TodaysPlan | null> {
  try {
    const today = getLogDateString();

    // The 21-day daily_reports read that used to ride along here fed the
    // capacity cap. Nothing sizes the plan from behaviour any more, so the
    // query is gone — one fewer round trip on the notification cron's hot path.
    const [{ data: profile }, { data: coverageRows }, { data: existing }, { data: completions }, { data: timetableRow }] = await Promise.all([
      admin
        .from('profiles')
        .select(`
          is_working_professional, is_repeater, target_percentile,
          hours_available, study_target_hours, weekend_hours_available, syllabus_target_date, plan_source,
          self_reported_weakest_section, self_reported_strongest_section, self_reported_weak_topic,
          baseline_varc, baseline_dilr, baseline_qa, coaching_enrolled, attempt_year, current_stage, start_with
        `)
        .eq('id', studentId)
        .single(),
      admin.from('topic_coverage').select('section, topic, status, is_priority').eq('student_id', studentId),
      admin
        .from('daily_routines')
        .select('phase, tasks, est_minutes, generated_hours, created_at')
        .eq('student_id', studentId)
        .eq('routine_date', today)
        .maybeSingle(),
      admin.from('routine_task_completions').select('task_id').eq('student_id', studentId).eq('routine_date', today),
      admin.from('student_timetables').select('blocks, confirmed_at').eq('student_id', studentId).maybeSingle(),
    ]);

    if (!profile) return null;

    const weakest = (profile.self_reported_weakest_section as Section | null)
      ?? weakestFromBaseline(profile)
      ?? weakestFromCoverage(coverageRows ?? [])
      ?? 'DILR';
    const strongest = (profile.self_reported_strongest_section as Section | null) ?? strongestFromBaseline(profile);
    const weakTopic = (profile.self_reported_weak_topic as string | null) || null;
    const currentStage = profile.current_stage as Stage | null;

    // THE SAME HOURS THE TRACKER USES, from the same module.
    //
    // This generator writes to the same daily_routines row the app reads, and
    // it runs FIRST — the 6am notification cron builds the day before the
    // student ever opens the app. So while this file sized plans with
    // capBudget(paceHours ?? claimed, capacity) and the route sized them with
    // the student's own hours, the cron's version is the one that won, every
    // morning, for every student who gets a notification. Fixing the route
    // alone would have fixed nothing. That is how "sometimes 4 hours,
    // sometimes 6" survived a fix aimed straight at it.
    //
    // Both callers now read lib/daily-hours and nothing else.
    const routineProfile: RoutineProfile = {
      isWorkingProfessional: !!profile.is_working_professional,
      isRepeater: !!profile.is_repeater,
      targetPercentile: profile.target_percentile as number | null,
      weekdayHours: dailyHours(profile).weekday,
      weekendHours: dailyHours(profile).weekend,
      // Stage A floor — kept in lockstep with today/route.ts (the mirror rule:
      // the 6am notification must name the same plan the student opens).
      weakestSection: weakest,
      strongestSection: strongest,
      weakTopic,
      currentStage,
      attemptYear: profile.attempt_year as number | null,
    };

    const history = await buildHistory(admin, studentId);
    // Same today's-class signal as the tracker route — this generator runs
    // FIRST (6am cron), so if it didn't know about today's class, the morning
    // notification would freeze an unaligned plan before the student woke up.
    const todayClassTopics = (profile.plan_source === 'coaching')
      ? coachingTopicsForDate(
          (timetableRow?.blocks as TimetableBlock[] | null) ?? [],
          timetableRow?.confirmed_at as string | null,
          today,
        )
      : [];
    // The student's own finish date is what makes the plan urgent or relaxed.
    const targetIso = profile.syllabus_target_date as string | null;
    const daysToTarget = targetIso
      ? Math.round((Date.parse(targetIso) - Date.parse(getLogDateString(now))) / 86_400_000)
      : null;
    const topicChoices = buildTopicChoices(coverageRows ?? [], routineProfile, history, profile.start_with as string | null, todayClassTopics, daysToTarget);

    // Read-or-generate, through the SAME staleness rule the tracker uses —
    // literally the same function now, rather than a hand-copied version of it
    // that could drift. A plan built earlier today is only rebuilt when the
    // student changed their own hours, and never over completed work.
    const dow = now.getDay();
    const hoursToday = (dow === 0 || dow === 6 ? routineProfile.weekendHours : routineProfile.weekdayHours)
      ?? (dow === 0 || dow === 6
        ? (routineProfile.isWorkingProfessional ? 4 : 3)
        : (routineProfile.isWorkingProfessional ? 1.5 : 2.5));

    let routine = existing as { phase: string; tasks: unknown; est_minutes: number; generated_hours: number | null; created_at?: string | null } | null;
    const completedIds = new Set((completions ?? []).map((c: { task_id: string }) => c.task_id));
    if (routine && planStaleReason({
      completionCount: completedIds.size,
      routineCreatedAt: routine.created_at ?? null,
      generatedHours: routine.generated_hours == null ? null : Number(routine.generated_hours),
      currentHours: hoursToday,
    })) {
      routine = null;
    }
    if (!routine) {
      // ONE PLAN PER STUDENT. Same authority the tracker route asks, and this
      // caller matters more: it runs at 6am, before the student is awake, so a
      // coverage-matrix plan frozen here would be the one they wake up to no
      // matter what the tracker later believes. See lib/timetable-day.
      const timetableTasks = timetableDayTasks({
        planSource: profile.plan_source as string | null,
        blocks: timetableRow?.blocks as TimetableBlock[] | null,
        confirmedAt: timetableRow?.confirmed_at as string | null,
        todayIso: today,
        dayMinutes: hoursToday * 60,
        phase: getPhase(now, routineProfile.attemptYear, routineProfile.currentStage, routineProfile.isRepeater),
      });
      const generated = timetableTasks
        ? {
            phase: getPhase(now, routineProfile.attemptYear, routineProfile.currentStage, routineProfile.isRepeater),
            tasks: timetableTasks,
            estMinutes: timetableTasks.reduce((s, t) => s + t.estMinutes, 0),
          }
        : generateRoutine(routineProfile, now, history, topicChoices.choices, topicChoices.extras);
      const { data: inserted } = await admin
        .from('daily_routines')
        .upsert(
          { student_id: studentId, routine_date: today, phase: generated.phase, tasks: generated.tasks, est_minutes: generated.estMinutes, generated_hours: hoursToday, created_at: new Date().toISOString() },
          { onConflict: 'student_id,routine_date' }
        )
        .select('phase, tasks, est_minutes, generated_hours, created_at')
        .single();
      routine = inserted ?? { phase: generated.phase, tasks: generated.tasks, est_minutes: generated.estMinutes, generated_hours: hoursToday, created_at: null };
    }
    if (!routine) return null; // unreachable — the block above always assigns; satisfies the null-checker

    const rawTasks = Array.isArray(routine.tasks) ? (routine.tasks as any[]) : [];
    const tasks: PlanTask[] = rawTasks.map((t) => ({
      id: String(t.id),
      section: t.section,
      topic: (t.topic as string | null) ?? null,
      label: String(t.label ?? ''),
      target: (t.target as string | null) ?? null,
      estMinutes: Number(t.estMinutes ?? 0),
      done: completedIds.has(String(t.id)),
    }));
    if (tasks.length === 0) return null;

    const topicTasks = tasks.filter((t) => t.topic);
    const doneCount = tasks.filter((t) => t.done).length;
    const nextTask = topicTasks.find((t) => !t.done) ?? tasks.find((t) => !t.done) ?? null;

    return {
      date: today,
      phase: routine.phase,
      tasks,
      topicTasks,
      firstTask: tasks[0] ?? null,
      nextTask,
      doneCount,
      totalCount: tasks.length,
      allDone: doneCount >= tasks.length,
      classTopics: todayClassTopics,
    };
  } catch {
    // Never let a plan-computation failure break the notification send — the
    // caller falls back to section-level copy.
    return null;
  }
}
