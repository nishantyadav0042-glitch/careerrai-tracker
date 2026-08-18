// ── THE portion a stored completion carries ─────────────────────────────────
//
// ONE authority for what a `routine_task_completions` row means, in the same
// spirit as coverage-status.ts: the moment a second file re-spells `'blue'`,
// the two copies drift and a third meaning appears. This repo has paid for
// that failure on the coverage ladder twice.
//
// Founder ruling, 18 Aug: **a half-tick is PARTIAL, never fully complete.**
//
// The plan card offers three states — not-marked / half / done — and labels
// the middle one "Got halfway". Before this module the tap was read three
// different ways, four lines apart in one function: hours counted it 0.5
// (correct), the coverage ladder advanced it one rung capped at `practicing`
// (correct), and day closure counted it FULLY DONE (wrong, undocumented, and
// contradicting the label the student reads).
//
// THE NULL RULE — `portionOf(null)` is `'full'`, and there are TWO reasons,
// not one. Stated here rather than only in a commit message:
//
//   1. HISTORICAL. All 29 null rows in production are 12–15 Jul, before the
//      portion control existed (the first green tick is 13 Jul). When they were
//      written the UI had no half option, so "ticked" meant "done".
//
//   2. STILL LIVE, and my earlier note in P0-2 was wrong to call this rule
//      purely historical. A task with no topic (a Mock or General block) offers
//      no portion choice at all: `handleTaskTap` sends a bare toggle and the
//      row is inserted with `confidence: null`. 255 of 900 stored routines
//      carry at least one topicless task, with routines through 18 Aug — so
//      this path is current, not residue.
//
// Both provenances mean the same thing: NO PARTIALITY WAS EVER EXPRESSED. That
// is why the answer is `'full'` and not `'unknown'` — this is not absence of
// evidence, it is a complete tick from a control that has only one option.
//
// NOT ruled here, and deliberately unchanged: `yellow` and `red` mark a
// COMPLETED task the student found hard. They keep counting as done. Ruling
// them would be the opportunistic cleanup the gate forbids.
//
// This module is a LEAF: it imports nothing, so anything may import it.

/** The confidence value the plan card and the log sheet both write for "Got halfway". */
export const HALF_TICK_SIGNAL = 'blue' as const;

export type CompletionPortion = 'full' | 'half';

/** How much of the task the stored row says was done. */
export function portionOf(confidence: string | null | undefined): CompletionPortion {
  return confidence === HALF_TICK_SIGNAL ? 'half' : 'full';
}

/**
 * May this completion count toward "the whole day is done"?
 *
 * Half may not. Everything else may — which preserves all 248 existing
 * production rows exactly, because none of them is a half.
 */
export function countsAsFullyDone(confidence: string | null | undefined): boolean {
  return portionOf(confidence) === 'full';
}

// ── The wire shape (P0-2.1) ─────────────────────────────────────────────────
//
// The server knowing a tick is partial is worth nothing if the client is handed
// a bare "done". `/api/routine/today` used to select `task_id, completed_at,
// is_emergency` and never `confidence`, so both consumers collapsed every
// completion into one done-set and rendered a half-tick as fully done.
//
// The route maps through THIS function rather than reading `confidence` and
// deciding for itself, and the raw signal never crosses the wire: a copy of the
// meaning on the client is a second place for it to drift, which is the
// eleven-coverage-producers failure one layer out.

export interface CompletionRow {
  task_id: string;
  is_emergency?: boolean | null;
  confidence?: string | null;
}

export interface ClientCompletion {
  task_id: string;
  is_emergency: boolean;
  portion: CompletionPortion;
}

export function toClientCompletions(rows: CompletionRow[]): ClientCompletion[] {
  return rows.map((r) => ({
    task_id: r.task_id,
    is_emergency: !!r.is_emergency,
    portion: portionOf(r.confidence),
  }));
}

// ── The transition (P0-2.3a) ────────────────────────────────────────────────
//
// `complete-task` used to be a pure toggle keyed on row EXISTENCE:
//
//     if (existingCompletion) { DELETE } else { INSERT }
//
// It never looked at the portion, so a student who marked a task "Got halfway",
// finished it later and tapped "Done" did not upgrade anything — the completion
// was DELETED and the task became untouched. PARTIAL -> FULL was not
// unimplemented, it was impossible, and attempting it destroyed the evidence
// that the student had done half.
//
// Founder rulings, 18 Aug (P0-2.2):
//   G7  PARTIAL -> FULL is an UPDATE to the existing row, never a second one.
//       One student + one task + one day = one canonical completion record.
//   G4  Re-marking an existing PARTIAL means "still PARTIAL". It must never
//       delete the evidence.
//   G2  FULL -> PARTIAL is prohibited. Correction goes through the untick,
//       exactly as the coverage ladder refuses a regression and offers the
//       explicit path instead.
//
// THE INTENT SIGNAL ALREADY EXISTS in the request — no new API shape was
// invented for this:
//   · carries `portion`/`confidence` → MARK it that way
//   · carries neither                → TOGGLE, which is both the untick gesture
//     and the mark-done gesture for a task that offers no portion choice.

export type CompletionIntent = 'mark_full' | 'mark_half' | 'toggle';

export type TransitionAction =
  | { action: 'insert'; portion: CompletionPortion }
  | { action: 'upgrade' }
  | { action: 'delete' }
  | { action: 'none'; reason: 'already_full' | 'already_half' | 'regression_refused' };

/**
 * `current` is the stored portion, or null when no completion row exists.
 *
 * Total by construction: every one of the nine cells is decided here rather
 * than in a route, so the matrix can be read in one place and tested without a
 * database.
 */
export function resolveTransition(
  current: CompletionPortion | null,
  intent: CompletionIntent
): TransitionAction {
  if (current === null) {
    // Nothing recorded yet. A bare toggle marks it done: no partial was ever
    // expressed, which is the same reasoning the historical rule applies to a
    // stored null.
    return { action: 'insert', portion: intent === 'mark_half' ? 'half' : 'full' };
  }
  if (intent === 'toggle') return { action: 'delete' };
  if (current === 'half') {
    return intent === 'mark_full' ? { action: 'upgrade' } : { action: 'none', reason: 'already_half' };
  }
  return intent === 'mark_half'
    ? { action: 'none', reason: 'regression_refused' }
    : { action: 'none', reason: 'already_full' };
}

// ── The plan-completion weight (P0-2.3b) ────────────────────────────────────
//
// Founder ruling G3, 18 Aug: "PARTIAL contributes 0.5 ONLY to the
// plan-completion ratio. Do not propagate 0.5 into coverage, touched-task
// counts, streaks, day closure, emergency minimums, or other whole-task
// metrics."
//
// WHY HERE AND NOWHERE ELSE. `completionRatio` (adaptation-engine.ts) is a LOAD
// proxy: it drives "your days are running heavy", the 'speed' constraint push
// and the coaching decision. Load is the one question where half-finishing is
// genuinely half — a student who half-finishes every task is not running a
// balanced day, and counting those as whole tasks tells them their load is
// fine. Every other metric asks a binary question (finished? touched?) and a
// half belongs wholly on one side of it; spreading 0.5 into a count of whole
// tasks would invent a third unit.
//
// `plan-completion-ratio.test.ts` asserts that exactly three files import this
// — the three accumulators that feed the one ratio — and that day closure, the
// coverage ladder and the Fact Registry never see it.
//
// NOT unified with creditedHours' own 0.5, deliberately: that one prices HOURS
// from coverage and this one weighs a TASK COUNT. Same number, different
// question, and merging them would be the umbrella-fact mistake in arithmetic.

export const FULL_WEIGHT = 1;
export const PARTIAL_WEIGHT = 0.5;

/** How much of one planned task this completion represents, for the load ratio only. */
export function completionWeight(confidence: string | null | undefined): number {
  return portionOf(confidence) === 'half' ? PARTIAL_WEIGHT : FULL_WEIGHT;
}

// ── The client half of the transition (P0-2.3c) ─────────────────────────────
//
// `resolveTransition` above decides what the SERVER does with a request. This
// decides what the CLIENT sends in the first place, and it lives in the same
// module on purpose: two files deciding one tap is how they drift into
// disagreeing, and `completion-interaction.test.ts` walks all nine cells
// through both to prove they agree.
//
// Before this existed, LoggingModal decided with `if (choice && !wasDone)` —
// which silently dropped a FULL choice on a task already marked PARTIAL, so
// the upgrade never left the browser.

export type TaskChoice = 'full' | 'half' | null;

/** A `complete-task` payload: a bare id means "toggle", a confidence means "mark". */
export interface CompletionRequest { id: string; confidence?: string }

/**
 * What to send for one task, given what is already stored and what the student
 * chose. `null` means send nothing — which is a real outcome three times over:
 * an untouched task left alone, a PARTIAL re-marked as partial (the evidence is
 * already correct), and a FULL offered a downgrade the contract prohibits.
 */
export function completionRequestFor(
  id: string,
  prior: CompletionPortion | null,
  choice: TaskChoice
): CompletionRequest | null {
  if (choice === null) return prior ? { id } : null;
  if (prior === null) {
    return { id, confidence: choice === 'half' ? HALF_TICK_SIGNAL : 'green' };
  }
  // Only one transition remains once something is stored: half -> full.
  if (prior === 'half' && choice === 'full') return { id, confidence: 'green' };
  return null;
}

// ── Which completions count as FINISHED (P0-2.3d) ───────────────────────────
//
// The closure audit found `routine/today` answering "was this finished?" with
// task-id membership: `yesterday.done` counted rows, and
// `yesterdayUnfinishedTopics` excluded any task with a row. Both counted a
// PARTIAL as finished, so a day of half-ticks rendered "⚡ Yesterday: all 4
// done" and the half-finished topic — the one most deserving of returning
// tomorrow — was silently dropped from the because-line.
//
// This is the set form of `countsAsFullyDone`, so a caller asking the
// finished-question gets one answer from one place. Callers asking whether a
// task was TOUCHED (per-section recency, timesPracticed, plannerRecency) must
// keep using plain membership — a half-tick genuinely touched the topic.

export function fullyDoneTaskIds(rows: CompletionRow[]): Set<string> {
  return new Set(rows.filter((r) => countsAsFullyDone(r.confidence)).map((r) => r.task_id));
}
