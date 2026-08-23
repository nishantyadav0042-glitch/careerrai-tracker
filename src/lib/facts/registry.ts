// ── The fact registry ───────────────────────────────────────────────────────
//
// One place where a fact is DEFINED, so a second definition cannot be added
// quietly. Rebuilt against current main (19 Aug) rather than merged from the
// parked branch: the branch's registry carried nine facts written before A3,
// G13-A, Q3 and Q4 existed, and importing them wholesale would have re-admitted
// semantics we have since settled differently.
//
// It therefore starts with ONE fact. Each further fact arrives when a consumer
// needs it and can be checked against the model that is actually live — which
// is the whole discipline this file exists to enforce.
//
// Every producer here is PURE: no I/O, no clock, no database, no model. The
// caller supplies persisted rows; nothing in this module may query.

import { type FactDef, type Provenance, known, unknown } from './contract';
import { loggedDaysLast7, loggedToday } from './daily-log';
import { type CanonicalQuestion } from './canonical';
import { portionOf } from '../completion-portion';

function prov(
  factKey: string, version: string, source: CanonicalQuestion, inputs: Record<string, unknown>,
): Provenance {
  return { factKey, version, source, inputs };
}

// ── Observed day outcome (G1 / 0C.3G-J1) ────────────────────────────────────
//
// day_outcome is TWO facts, not one.
//
// `self_reported_day_outcome` is what the STUDENT declared — the check-in gate
// and the log sheet's Rest toggle, both untouched by this fact and both still
// writing daily_reports.day_outcome directly. A3 reads that column, and must
// go on reading it.
//
// This is the OTHER one: what CareerRai's own tick records show, independent of
// anything the student said. The two are allowed to disagree; that disagreement
// is a signal, and merging them into one column is what J1 forbids.
//
// CAN ONLY EVER ANSWER 'studied' OR 'partial'. Never 'skipped' or
// 'not_studied', because those are claims about ABSENCE -- "I rested", "I
// didn't study" -- that no tick record can support. An observed fact has
// evidence of presence or it has none; it never has evidence of a deliberate
// absence. That is exactly why that half of the ladder stays self-reported, and
// it is the same reasoning A3's WORK_HAPPENED union reached independently.
//
// REBUILT DETAIL, not carried over: the branch counted a task as finished via
// its own local helper. This uses completion-portion.ts, the authority shipped
// today, so a half-tick is PARTIAL here for the same reason it no longer closes
// the day. The branch predates that module.

export interface ObservedOutcomeCompletion {
  task_id: string;
  confidence?: string | null;
}

export const observedDayOutcome: FactDef<
  { completions: ObservedOutcomeCompletion[]; plannedTaskIds: string[]; mockTaken: boolean },
  'studied' | 'partial'
> = {
  key: 'observed_day_outcome',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: "What CareerRai's own tick records show happened on a day — never what the student declared.",
  canonicalSource: 'observedBehaviour',
  unit: 'outcome',
  timeBasis: 'point_in_time',
  unknownWhen: ['no completion rows exist for the day and no mock was taken'],
  produce: ({ completions, plannedTaskIds, mockTaken }) => {
    const p = prov('observed_day_outcome', 'v1', 'observedBehaviour', {
      completions: completions.length, planned: plannedTaskIds.length, mockTaken,
    });

    if (completions.length === 0 && !mockTaken) return unknown('no_evidence', p);

    // 'studied' requires the whole plan finished OUTRIGHT. A plan of zero tasks
    // cannot be finished -- vacuous truth would claim a full day on no evidence,
    // the same trap planFullyDone refuses.
    const finishedIds = new Set(
      completions.filter((c) => portionOf(c.confidence) === 'full').map((c) => c.task_id),
    );
    const wholePlanFinished =
      plannedTaskIds.length > 0 && plannedTaskIds.every((id) => finishedIds.has(id));

    return known(wholePlanFinished ? 'studied' : 'partial', p);
  },
};

// ── 0C.3 Wave 1 (23 Aug) ────────────────────────────────────────────────────
//
// The logged-day facts live in ./daily-log.ts rather than inline here: they
// share a window authority (./window.ts) and an input shape, and the file
// carries the reasoning for why zero is a measurement in this one case and a
// lie in most others. Re-exported so `FACTS` stays the single index.
export { loggedDaysLast7, loggedToday } from './daily-log';

/** Every fact this registry defines, by key. One definition each. */
export const FACTS = {
  observed_day_outcome: observedDayOutcome,
  logged_days_last_7: loggedDaysLast7,
  logged_today: loggedToday,
} as const;
