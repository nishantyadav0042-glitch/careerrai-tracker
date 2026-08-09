// ── Sweeping every student without silently dropping the tail ───────────────
//
// Seventeen crons select the whole student roster and walk it in a single
// invocation. Measured 9 Aug: the walk is SEQUENTIAL — `await dispatch(...)`
// once per student, each one a database write plus a push send. Plan compute
// alone is 18.1ms/student, and a dispatch with network is far more.
//
// Three separate faults, and only the first is the one people talk about:
//
// 1. THE TAIL DIES IN SILENCE. A Vercel function has a hard duration cap. When
//    it is hit mid-loop the invocation is killed, the students at the end of
//    the list are never processed, and the response nobody reads would have
//    said "reminded: 812" as though that were the whole roster. Every day, the
//    same students at the end of the same ordering. That is the worst possible
//    failure mode: wrong, stable, and invisible.
//
// 2. SEQUENTIAL IS THE ACTUAL CLIFF. At ~150ms per student a single invocation
//    clears ~2,000 students inside 300s. The fix that moves the number by an
//    order of magnitude is not a cursor — it is not waiting for one student's
//    push to land before starting the next one's.
//
// 3. `.in(ids)` BREAKS ON ITS OWN. PostgREST sends the filter in the URL, so a
//    10,000-element `.in('student_id', ids)` exceeds the request line limit
//    long before the duration cap is reached. That one fails loudly, at least.
//
// This module fixes all three, and its contract is that a partial sweep is
// always REPORTED. `complete: false` is a fact the caller must surface, never
// something the helper is allowed to shrug off.

/** How many students are in flight at once. */
export const SWEEP_CONCURRENCY = 8;

/**
 * Stop this much before the function's own ceiling.
 *
 * The margin is for the work AFTER the loop — the summary insert, the alert,
 * the JSON response. A sweep that uses its whole budget and is then killed
 * while reporting that it was killed has reported nothing.
 */
export const SWEEP_SAFETY_MARGIN_MS = 8_000;

/** Chunk size for `.in()` filters, kept well under the PostgREST URL limit. */
export const IN_CHUNK = 200;

export interface SweepOptions<T> {
  items: T[];
  /** Per-item work. A throw is contained: it fails that item, not the sweep. */
  handler: (item: T, index: number) => Promise<void>;
  /** Total wall-clock budget, INCLUDING the safety margin. */
  budgetMs: number;
  concurrency?: number;
  /** Injected so tests are deterministic and do not sleep. */
  now?: () => number;
}

export interface SweepResult {
  processed: number;
  failed: number;
  /** True only when every item was attempted. */
  complete: boolean;
  /** Items never attempted because the budget ran out. */
  remaining: number;
  /** Index to resume from next invocation. */
  cursor: number;
}

/**
 * Walk `items` with bounded concurrency, stopping before the budget expires.
 *
 * The deadline is checked before STARTING each item rather than after
 * finishing, because the question that matters is "is there room for another
 * one", not "did the last one fit".
 *
 * One item's failure never stops the sweep. A single student with a malformed
 * profile must not cost the other 9,999 their reminder — that is the same
 * class of bug as the silent tail, just triggered by data instead of time.
 */
export async function sweep<T>(opts: SweepOptions<T>): Promise<SweepResult> {
  const now = opts.now ?? Date.now;
  const concurrency = Math.max(1, opts.concurrency ?? SWEEP_CONCURRENCY);
  const deadline = now() + Math.max(0, opts.budgetMs - SWEEP_SAFETY_MARGIN_MS);

  let next = 0;
  let processed = 0;
  let failed = 0;
  let outOfTime = false;

  async function worker(): Promise<void> {
    for (;;) {
      if (now() >= deadline) { outOfTime = true; return; }
      const i = next++;
      if (i >= opts.items.length) return;
      try {
        await opts.handler(opts.items[i], i);
        processed++;
      } catch {
        // Contained on purpose — see the doc comment above.
        failed++;
        processed++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, opts.items.length) }, worker));

  // `next` overshoots by up to `concurrency` because each worker claims an
  // index before discovering the list is done. Clamp so `cursor` is a real
  // position and `remaining` can never go negative.
  const cursor = Math.min(processed, opts.items.length);
  const remaining = opts.items.length - cursor;

  return {
    processed,
    failed,
    complete: remaining === 0 && !(outOfTime && remaining > 0),
    remaining,
    cursor,
  };
}

/**
 * Split a list for `.in()` filters.
 *
 * Callers must query per chunk and merge. Passing 10,000 ids straight to
 * PostgREST does not fail gracefully — it fails as an unreadable HTTP error
 * that looks nothing like "your list was too long".
 */
export function chunked<T>(items: T[], size = IN_CHUNK): T[][] {
  if (size < 1) throw new Error('chunk size must be >= 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The line a cron returns when it could not finish.
 *
 * Deliberately not a silent field on a JSON blob nobody reads. A sweep that
 * skipped students is an incident, and it has to read like one.
 */
export function incompleteWarning(label: string, r: SweepResult): string {
  return `[cron:${label}] INCOMPLETE — processed ${r.processed}, ` +
    `${r.remaining} student${r.remaining === 1 ? '' : 's'} never reached before the time budget ran out. ` +
    `Resume cursor: ${r.cursor}.`;
}
