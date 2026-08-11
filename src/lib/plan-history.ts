// ── The planner's memory of what it already did ─────────────────────────────
//
// Three signals, and every surface that plans must be fed the SAME three or it
// is planning for a different student:
//
//   daysSincePlannedByTopic    when a topic was last PUT ON A PLAN
//   daysSinceLastPracticedByTopic  when the student last actually DID it
//   postponedTopics            what they swapped out of the last past day
//
// The first one is the signal that killed the Percentages loop. Nothing in the
// score used to know a topic had recently been ON THE PLAN — only when it was
// last *practised*, which a student who skips the task never updates. So a
// topic could be served, ignored, and served again indefinitely: Percentages
// seven times in twelve days.
//
// This computation lived in api/routine/today and in lib/routine-plan, and the
// Whole Plan had none of it at all — which is why, on the day the planner was
// otherwise unified, Home's second QA block was Inequalities and the Whole
// Plan's was Percentages for the same student on the same morning. Same
// authority, different inputs, different answer. One function now.

export interface PlannerRecency {
  daysSinceLastPracticedByTopic: Record<string, number | null>;
  daysSincePlannedByTopic: Record<string, number | null>;
  postponedTopics: string[];
}

export interface RoutineRow {
  routine_date: string;
  tasks: unknown;
  swapped_out?: unknown;
}

export interface CompletionRow {
  routine_date: string;
  task_id: string;
}

/**
 * Pure: rows in, planner signals out. The callers differ in what else they
 * fetch (today's route also feeds the Adaptation Engine), so they own the
 * queries; this owns the arithmetic.
 *
 * `today` is the log-day string (3am IST boundary — see streak-utils), not a
 * calendar date, so a 1am study session counts against the right day.
 */
export function plannerRecency(
  pastRoutines: RoutineRow[],
  pastCompletions: CompletionRow[],
  today: string,
): PlannerRecency {
  const completedByDate = new Map<string, Set<string>>();
  for (const c of pastCompletions) {
    if (!completedByDate.has(c.routine_date)) completedByDate.set(c.routine_date, new Set());
    completedByDate.get(c.routine_date)!.add(c.task_id);
  }

  // "Never delete, always postpone": whatever was swapped out of the most
  // recent PAST day comes back with a decisive bonus, so nothing is ever lost.
  const lastPastDay = pastRoutines.find((r) => r.routine_date < today);
  const postponedTopics: string[] = Array.isArray(lastPastDay?.swapped_out)
    ? (lastPastDay.swapped_out as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  const daysSinceLastPracticedByTopic: Record<string, number | null> = {};
  const daysSincePlannedByTopic: Record<string, number | null> = {};

  for (const r of pastRoutines) {
    const completedTaskIds = completedByDate.get(r.routine_date) ?? new Set<string>();
    const dayGap = Math.round((Date.parse(today) - Date.parse(r.routine_date)) / 86_400_000);
    // Guard against legacy/corrupt rows where tasks is null or not an array —
    // an unguarded for-of throws and rejects the whole plan computation.
    const tasks = Array.isArray(r.tasks) ? (r.tasks as { id?: unknown; topic?: unknown }[]) : [];
    for (const t of tasks) {
      const topic = typeof t?.topic === 'string' && t.topic.length > 0 ? t.topic : null;
      if (!topic) continue;
      if (daysSincePlannedByTopic[topic] == null) daysSincePlannedByTopic[topic] = dayGap;
      if (completedTaskIds.has(String(t.id)) && daysSinceLastPracticedByTopic[topic] == null) {
        daysSinceLastPracticedByTopic[topic] = dayGap;
      }
    }
  }

  return { daysSinceLastPracticedByTopic, daysSincePlannedByTopic, postponedTopics };
}
