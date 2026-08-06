// ── The because-line: why today's plan looks the way it does ────────────────
//
// The loop the whole product hangs on is: yesterday's check-in → the plan
// reacts → the student SEES it react → they check in again. The engine has
// adapted daily for weeks; the seeing was missing. The Home card said
// "today's plan has already adjusted" — a claim, generic, identical for every
// student. Nobody feels "the system reacted to ME" from a generic line.
// Feeling requires specificity: "Geometry first — it didn't get finished
// yesterday" is proof.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: we only ever say "because of your
// log" when it is actually true. Every clause below asserts something
// checkable against the same data the engine used. The first time a student
// catches the app claiming their log changed something it didn't, the loop
// becomes theatre and dies. When no true specific claim exists, we return
// null and the UI falls back to the honest generic line — a weaker sentence
// is better than a false one.
//
// Pure and dependency-free so every clause is testable without a database.

export interface PlanReasonInput {
  /** Today's tasks, in display order. topic may be null on legacy rows. */
  todayTasks: { topic: string | null; label?: string }[];
  /** Yesterday's routine outcome, from daily_routines + completions. */
  yesterday: { total: number; done: number } | null;
  /** Topics on yesterday's plan whose task was never completed. */
  yesterdayUnfinishedTopics: string[];
  /** Topics the student explicitly swapped out (postponed, never deleted). */
  postponedTopics: string[];
  /** Yesterday's check-in, when one exists. */
  dayOutcome: 'studied' | 'partial' | 'not_studied' | 'skipped' | null;
  blockerReason: string | null;
}

export interface PlanReason {
  line: string;
  /** Which truth produced it — for telemetry, so we learn which claims land. */
  kind: 'carried' | 'postponed' | 'built_on' | 'rest_return' | 'restart';
}

export function planReason(input: PlanReasonInput): PlanReason | null {
  const todayTopics = input.todayTasks
    .map((t) => t.topic)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);

  // 1 — A topic left unfinished yesterday is on today's plan. The strongest
  // possible proof of the loop: their incomplete day visibly shaped today.
  const carried = todayTopics.find((t) => input.yesterdayUnfinishedTopics.includes(t));
  if (carried) {
    const isFirst = todayTopics[0] === carried;
    return {
      kind: 'carried',
      line: isFirst
        ? `${carried} first — it didn't get finished yesterday.`
        : `${carried} is back on today's plan — it didn't get finished yesterday.`,
    };
  }

  // 2 — A topic they explicitly postponed has returned. "Never delete,
  // always postpone" is the engine's rule; this is where the student learns it.
  const postponed = todayTopics.find((t) => input.postponedTopics.includes(t));
  if (postponed) {
    return {
      kind: 'postponed',
      line: `${postponed} is back — you postponed it, and nothing gets lost.`,
    };
  }

  // Rung 3 used to be "Today is lighter — you said the plan was too heavy, and
  // we adjusted." It is gone because the app no longer adjusts. The plan is
  // sized to the student's own hours and nothing else (lib/daily-hours.ts), so
  // that sentence would now be a comforting claim about something that did not
  // happen — the exact kind of line this module exists to refuse.
  //
  // A student who keeps saying the day is too heavy is not ignored: the reading
  // reaches their buddy and the admin surfaces, and they can change their own
  // number in one place. What we will not do is quietly shrink their day and
  // tell them we helped.

  // 4 — A clean sweep yesterday. Momentum, said out loud with the number.
  if (input.yesterday && input.yesterday.total > 0 && input.yesterday.done >= input.yesterday.total) {
    return {
      kind: 'built_on',
      line: `All ${input.yesterday.total} done yesterday — today builds straight on it.`,
    };
  }

  // 5 — An honest rest day deserves a welcome, not a catch-up lecture.
  if (input.dayOutcome === 'skipped') {
    return {
      kind: 'rest_return',
      line: 'Back from your rest day — today picks up exactly where you left off.',
    };
  }

  // 6 — A day that didn't happen. The plan's job is a restart, not a guilt trip.
  if (input.dayOutcome === 'not_studied') {
    return {
      kind: 'restart',
      line: "Yesterday didn't happen — today is built to restart, not to catch up.",
    };
  }

  // Nothing specific is TRUE. Say nothing rather than something vague.
  return null;
}
