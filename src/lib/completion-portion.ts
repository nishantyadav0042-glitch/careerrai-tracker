// ── What a stored completion actually MEANS ─────────────────────────────────
//
// ONE authority for reading a `routine_task_completions` row, in the same
// spirit as coverage-status.ts: the moment a second file re-spells 'blue', the
// two copies drift and a third meaning appears. This repo has paid for that on
// the coverage ladder twice.
//
// Founder ruling, 18 Aug: **a half-tick is PARTIAL, never fully complete.**
//
// The plan card and the log sheet both offer three states — not-marked / half /
// done — and label the middle one "Got halfway". The tap was then read two
// different ways twelve lines apart in one function: creditedHours counted it
// 0.5 (correct), while day closure counted it FULLY DONE (wrong, undocumented,
// and contradicting the label the student had just read). A student who marked
// every task "Got halfway" closed their day, advanced their streak and was told
// "Ready for tomorrow" — having explicitly said they only got halfway.
//
// THE NULL RULE — portionOf(null) is 'full', and the evidence is narrower than
// an earlier note in this repo claimed. Re-measured 19 Aug: all 29 null-
// confidence rows in production fall in 12–15 Jul, before the portion control
// existed; there are none since. A second path could still produce one — a
// bare toggle that sends neither confidence nor portion — and it means the same
// thing: NO PARTIALITY WAS EVER EXPRESSED. That is why the answer is 'full' and
// not 'unknown'. This is not absence of evidence; it is a complete tick from a
// control that offered no alternative.
//
// NOT ruled here, deliberately: 'yellow' and 'red' mark a COMPLETED task the
// student found hard. They keep counting as done. Reclassifying them would be
// the opportunistic scope creep the gate forbids.
//
// A LEAF: imports nothing, so anything may import it.

/** The confidence value both surfaces write for "Got halfway". */
export const HALF_TICK_SIGNAL = 'blue' as const;

export type CompletionPortion = 'full' | 'half';

/** How much of the task a stored completion represents. */
export function portionOf(confidence: string | null | undefined): CompletionPortion {
  return confidence === HALF_TICK_SIGNAL ? 'half' : 'full';
}

/** Was this task finished outright? */
export function isFullyDone(confidence: string | null | undefined): boolean {
  return portionOf(confidence) === 'full';
}

/**
 * Did the student finish EVERY planned task outright?
 *
 * The question day-closure actually needs, and the one it was getting wrong:
 * membership in the completed set is not the same as completion. A plan is
 * finished when every task on it has a completion AND none of those is a
 * half-tick.
 *
 * An empty plan is not "finished" — vacuous truth here would close a day on
 * no evidence at all.
 */
export function planFullyDone(
  plannedTaskIds: readonly string[],
  completions: readonly { task_id: string; confidence?: string | null }[],
): boolean {
  if (plannedTaskIds.length === 0) return false;
  const byId = new Map(completions.map((c) => [c.task_id, c.confidence ?? null]));
  return plannedTaskIds.every((id) => byId.has(id) && isFullyDone(byId.get(id)));
}
