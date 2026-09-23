import { portionOf } from '@/lib/completion-portion';

// ── THE DAY-1 → DAY-2 BRIDGE, DERIVED, NEVER ASSERTED ───────────────────────
//
// Mission of 22 Sep 2026. The forensic report established that CareerRai's
// repeat-study cohort is 72 students with a median of 3 study days, that the
// dominant loop is open → tick → resource → leave → return → tick, and that
// nothing in the data could say what state a student was LEFT in when a study
// day ended, how they came back, or whether they resumed. This module is the
// one place those three things are derived from durable rows.
//
// It is pure. Everything it needs is passed in, so it can be tested without a
// database and re-run over history without new instrumentation:
//
//   daily_routines.tasks            what the plan offered that day
//   routine_task_completions        what was ticked, when, and how much
//   daily_reports                   whether the day was credited, and how
//   student_events resource_opened  a resource link was followed
//   student_events log_open         the sheet was opened (prompted or tapped)
//   student_events screen_exit      the inferred session end (reason 'hidden')
//
// EPISTEMICS. Every output here is a reading of the ledger, not of the
// student. "Unfinished work exists" means tasks remained unticked; it does
// not mean the student intended to finish them. "Resumed" means the first
// Day-2 tick was on a topic Day-1 left unfinished — a defensible relationship
// between two rows, never an inference from "the same screen opened".
// Nothing here is causal.

export interface PlanTask {
  id: string;
  topic: string | null;
  section?: string;
  label?: string;
}

export interface Completion {
  task_id: string;
  completed_at: string;            // ISO
  confidence?: string | null;      // 'blue' = half (lib/completion-portion.ts)
}

export interface ReportRow {
  study_duration: number | null;
  study_duration_source: string | null;
  created_at: string;              // when the day was first credited
}

export interface DayInputs {
  /** IST date, YYYY-MM-DD. */
  date: string;
  /** daily_routines.tasks for that date; null when no plan was generated. */
  tasks: PlanTask[] | null;
  completions: Completion[];
  report: ReportRow | null;
  /** resource_opened events that day (taskId/topic from props). */
  resourceOpens: { taskId?: string | null; topic?: string | null; at: string }[];
  /** log_open events that day, any `via`. */
  logOpens: number;
  /** A daily_log with surface 'log_sheet' that day — the sheet door was used. */
  sheetLogged: boolean;
  /** Last screen_exit{reason:'hidden'} that day, if any. */
  lastHiddenAt: string | null;
  /** The day's last event of any kind. */
  lastEventAt: string | null;
}

export type StudyPath = 'tick' | 'sheet' | 'both' | 'none';
export type SessionEndKind = 'inferred_hidden' | 'inferred_last_event' | 'none';
export type ContinuationPath = 'unfinished_plan' | 'plan_done' | 'no_plan';

export interface StateLeftBehind {
  date: string;
  planned: number;
  done: number;
  half: number;
  remaining: number;
  lastCompletedTaskId: string | null;
  lastCompletedTopic: string | null;
  /** First unticked task in plan order — what the plan card was offering. */
  nextTaskId: string | null;
  nextTopic: string | null;
  /** Topics planned that day and not fully ticked: what the planner carries forward. */
  unfinishedTopics: string[];
  unfinished: boolean;
  resourceOpened: boolean;
  logOpened: boolean;
  /** daily_reports.study_duration > 0 — the operational definition of a real study day. */
  dayClosed: boolean;
  studyPath: StudyPath;
  sessionEnd: { at: string | null; kind: SessionEndKind };
  continuationPath: ContinuationPath;
}

const byTime = (a: { completed_at: string }, b: { completed_at: string }) =>
  a.completed_at < b.completed_at ? -1 : a.completed_at > b.completed_at ? 1 : 0;

export function stateLeftBehind(d: DayInputs): StateLeftBehind {
  const tasks = d.tasks ?? [];
  const topicOf = new Map(tasks.map((t) => [t.id, t.topic ?? null]));
  const done = new Map<string, Completion>();
  for (const c of d.completions) done.set(c.task_id, c);   // one row per task; a later undo deletes it

  const half = [...done.values()].filter((c) => portionOf(c.confidence) === 'half').length;
  const fullyDone = new Set([...done.values()].filter((c) => portionOf(c.confidence) === 'full').map((c) => c.task_id));
  const remainingTasks = tasks.filter((t) => !done.has(t.id));
  const last = [...done.values()].sort(byTime).at(-1) ?? null;

  const unfinishedTopics = [...new Set(
    tasks.filter((t) => t.topic && !fullyDone.has(t.id)).map((t) => t.topic as string),
  )];

  const dayClosed = Number(d.report?.study_duration ?? 0) > 0;
  const ticked = done.size > 0;
  const studyPath: StudyPath = ticked && d.sheetLogged ? 'both' : ticked ? 'tick' : d.sheetLogged ? 'sheet' : 'none';

  const sessionEnd: StateLeftBehind['sessionEnd'] = d.lastHiddenAt
    ? { at: d.lastHiddenAt, kind: 'inferred_hidden' }
    : d.lastEventAt
      ? { at: d.lastEventAt, kind: 'inferred_last_event' }
      : { at: null, kind: 'none' };

  const continuationPath: ContinuationPath = d.tasks == null
    ? 'no_plan'
    : remainingTasks.length > 0 ? 'unfinished_plan' : 'plan_done';

  return {
    date: d.date,
    planned: tasks.length,
    done: done.size,
    half,
    remaining: remainingTasks.length,
    lastCompletedTaskId: last?.task_id ?? null,
    lastCompletedTopic: last ? (topicOf.get(last.task_id) ?? null) : null,
    nextTaskId: remainingTasks[0]?.id ?? null,
    nextTopic: remainingTasks[0]?.topic ?? null,
    unfinishedTopics,
    unfinished: remainingTasks.length > 0 || half > 0,
    resourceOpened: d.resourceOpens.length > 0,
    logOpened: d.logOpens > 0,
    dayClosed,
    studyPath,
    sessionEnd,
    continuationPath,
  };
}

// ── The return ──────────────────────────────────────────────────────────────

export type ReturnKind =
  | 'A_resumed_unfinished'   // first tick on a topic Day-1 left unfinished
  | 'B_continued_plan'       // first tick on a topic Day-1's plan carried
  | 'C_started_new_task'     // first tick on a topic Day-1's plan did not have
  | 'D_browsed_no_action'    // reached a study surface, ticked and logged nothing
  | 'E_log_only'             // the sheet was the only study surface used
  | 'F_other_surface'        // never reached a study surface
  | 'G_abandoned';           // no event on any later day in the window

/** Screens on which the plan or the log can be acted on. */
export const STUDY_SURFACES = ['/student/tracker', '/student/plan', '/student/plan/topics', '/student/blueprint'] as const;

export interface ReturnInputs {
  day1: Pick<StateLeftBehind, 'unfinishedTopics' | 'sessionEnd'> & { plannedTopics: string[] };
  day2: {
    /** Any event on a later day inside the window. */
    entered: boolean;
    firstEventAt: string | null;
    /** 'app_open' | 'app_resume' | other — what the first row was. */
    firstEventKind: string | null;
    /** `launch` prop of that first row, when it carried one (post-22 Sep only). */
    launch: string | null;
    /** Ticks on the return day(s), in time order, with the topic from that day's plan. */
    ticks: { task_id: string; topic: string | null; at: string }[];
    /** A daily_log with surface 'log_sheet' on the return day. */
    sheetLogged: boolean;
    /** Distinct screen paths seen on the return day. */
    screens: string[];
    /** daily_reports.study_duration > 0 on the return day. */
    studied: boolean;
  };
}

export interface ReturnReading {
  kind: ReturnKind;
  /** Milliseconds from Day-1's inferred session end to the first Day-2 event; null when either is unknown. */
  msToReentry: number | null;
  reachedStudySurface: boolean;
  studied: boolean;
}

export function classifyReturn(r: ReturnInputs): ReturnReading {
  const { day1, day2 } = r;
  const reachedStudySurface = day2.screens.some((s) => (STUDY_SURFACES as readonly string[]).includes(s));
  const studied = day2.studied;
  const msToReentry = day1.sessionEnd.at && day2.firstEventAt
    ? Math.max(0, Date.parse(day2.firstEventAt) - Date.parse(day1.sessionEnd.at))
    : null;

  if (!day2.entered) return { kind: 'G_abandoned', msToReentry: null, reachedStudySurface: false, studied: false };

  const first = [...day2.ticks].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))[0];
  if (first) {
    const unfinished = new Set(day1.unfinishedTopics);
    const planned = new Set(day1.plannedTopics);
    const kind: ReturnKind = first.topic && unfinished.has(first.topic)
      ? 'A_resumed_unfinished'
      : first.topic && planned.has(first.topic)
        ? 'B_continued_plan'
        : 'C_started_new_task';
    return { kind, msToReentry, reachedStudySurface: true, studied };
  }
  if (day2.sheetLogged) return { kind: 'E_log_only', msToReentry, reachedStudySurface: true, studied };
  if (reachedStudySurface) return { kind: 'D_browsed_no_action', msToReentry, reachedStudySurface, studied };
  return { kind: 'F_other_surface', msToReentry, reachedStudySurface: false, studied };
}
