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
  type Section,
  type HistoryInput,
} from '@/lib/routine-engine';
import { buildDayPlan } from '@/lib/plan-day';
import { plannerRecency } from '@/lib/plan-history';
import type { DebriefRow } from '@/lib/mock-informed-focus';
import { planStaleReason } from '@/lib/plan-freshness';
import { getLogDateString } from '@/lib/streak-utils';
import { countsAsFullyDone } from './completion-portion';

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
  /**
   * The focus and hours this plan was ACTUALLY built with.
   *
   * Carried on the plan because the notification cron used to derive both by
   * hand for its copy, ten lines before computing the real plan through
   * buildDayPlan — so a student could be told "DILR is your weakest, 3h
   * committed" above a plan that led VARC at 8h. The copy now reads what the
   * plan was built from instead of guessing it again.
   */
  weakestSection: Section;
  hoursToday: number;
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

// weakestFromBaseline / strongestFromBaseline used to live here as byte-copies
// of lib/focus-sections. They were left behind by the buildDayPlan extraction
// and had no callers — exactly the shape that grows back into a second
// authority. Deleted; focus-sections owns the chain.

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
    // recentDebriefRows joins this wave because the focus resolver needs it:
    // the cron previously had no mock branch at all, which is precisely how
    // it and the tracker route ended up building different days. Same wave,
    // so it costs no extra round trip.
    const [{ data: profile }, { data: coverageRows }, { data: existing }, { data: completions }, { data: timetableRow }, { data: recentDebriefRows }] = await Promise.all([
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
      admin.from('routine_task_completions').select('task_id, confidence').eq('student_id', studentId).eq('routine_date', today),
      admin.from('student_timetables').select('blocks, confirmed_at').eq('student_id', studentId).maybeSingle(),
      admin
        .from('mock_debriefs')
        .select('taken_on, varc, dilr, qa')
        .eq('student_id', studentId)
        .order('taken_on', { ascending: false })
        .limit(5),
    ]);

    if (!profile) return null;

    // ── ONE DAY-BUILDER (lib/plan-day) ────────────────────────────────
    //
    // Focus, hours, class topics, target pacing, the timetable fork and the
    // engine call all live in ONE function that the tracker route also uses.
    // Sharing the individual helpers was not enough: the ASSEMBLY was written
    // twice, and that is exactly where the two-writer bug lived — this file's
    // focus chain silently had no mock branch for weeks while every part it
    // called was already "shared".
    const history = await buildHistory(admin, studentId);
    const plan = buildDayPlan({
      profile,
      coverageRows: (coverageRows ?? []) as { section: string; topic: string; status: string; is_priority?: boolean | null }[],
      debriefRows: (recentDebriefRows ?? []) as DebriefRow[],
      timetableRow: timetableRow ?? null,
      history,
      today,
      now,
    });
    const { hoursToday } = plan;
    const todayClassTopics = plan.todayClassTopics;

    // Read-or-generate, through the SAME staleness rule the tracker uses.
    // A plan built earlier today is only rebuilt when the student changed
    // their own hours, and never over completed work.
    let routine = existing as { phase: string; tasks: unknown; est_minutes: number; generated_hours: number | null; created_at?: string | null } | null;
    // Two sets, two questions. `completedIds` answers "was this plan touched?"
    // and still drives planStaleReason; `fullyDoneIds` answers "was this task
    // finished?" and drives the flag below.
    const completedIds = new Set((completions ?? []).map((c: { task_id: string }) => c.task_id));
    const fullyDoneIds = new Set(
      (completions ?? [])
        .filter((c: { confidence?: string | null }) => countsAsFullyDone(c.confidence ?? null))
        .map((c: { task_id: string }) => c.task_id)
    );
    if (routine && planStaleReason({
      completionCount: completedIds.size,
      routineCreatedAt: routine.created_at ?? null,
      generatedHours: routine.generated_hours == null ? null : Number(routine.generated_hours),
      currentHours: hoursToday,
    })) {
      routine = null;
    }
    if (!routine) {
      const generated = { phase: plan.phase, tasks: plan.tasks, estMinutes: plan.estMinutes };
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
      // P0-2.3e — FINISHED, not merely ticked. doneCount, allDone and
      // nextTask all read this flag, and study-companion turns them into
      // pushes: a half-done task used to read as finished, so the 20:30 push
      // overstated "N of M done" and nextTask skipped the one task most
      // deserving of a nudge.
      done: fullyDoneIds.has(String(t.id)),
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
      weakestSection: plan.focus.weakest,
      hoursToday: plan.hoursToday,
    };
  } catch {
    // Never let a plan-computation failure break the notification send — the
    // caller falls back to section-level copy.
    return null;
  }
}
