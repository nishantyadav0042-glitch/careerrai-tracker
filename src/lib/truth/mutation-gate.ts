// ── No mutation without a source that actually answered ─────────────────────
//
// The 23 Aug chain was:
//
//     READ FAILED -> DEFAULT VALUE -> BUSINESS DECISION -> STUDENT MUTATED
//
// Every step there is individually reasonable. The damage came from the arrow
// between the first and second. This module removes that arrow by making the
// source state a required argument of the decision, so a caller cannot reach
// the mutation without having said out loud what the read returned.
//
// The required flow:
//
//     READ -> SOURCE VALID? -> CALCULATE -> CALCULATION VALID? -> MUTATE

import { type Source, isUnavailable } from './source';

export type GateOutcome<T> =
  | { readonly proceed: true; readonly data: T }
  | { readonly proceed: false; readonly skipped: 'source_unavailable'; readonly reason: string };

/**
 * The only door to a student-state mutation that depends on a read.
 *
 * Returns `proceed: false` when the source could not answer — the caller then
 * has a value it can log and report, and no number it could mistake for a
 * fact. NO_DATA proceeds with an empty dataset, because "we asked and there is
 * nothing" is a real answer and zero is its honest rendering.
 */
export function gateOnSource<T>(source: Source<T[]>, empty: T[] = []): GateOutcome<T[]> {
  if (isUnavailable(source)) {
    return { proceed: false, skipped: 'source_unavailable', reason: source.reason };
  }
  return { proceed: true, data: source.state === 'value' ? source.value : empty };
}

/** What a job reports when it declined to act. Distinguishable, in logs and in
 *  cron_runs, from a run that genuinely found nothing to do — which is the
 *  difference between "nobody studied" and "we could not tell". */
export interface SkippedRun {
  ok: false;
  skipped: 'source_unavailable';
  reason: string;
  mutated: 0;
}

export function skippedRun(reason: string): SkippedRun {
  return { ok: false, skipped: 'source_unavailable', reason, mutated: 0 };
}
