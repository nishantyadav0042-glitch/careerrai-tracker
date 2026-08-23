import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { observedDayOutcome, FACTS } from './registry';
import { CANONICAL_SOURCES } from './canonical';

// ── G1 (0C.3G / J1): day_outcome is TWO facts, not one ──────────────────────
//
// `self_reported_day_outcome` is what the STUDENT declared -- the check-in gate
// and the log sheet's Rest toggle, both writing daily_reports.day_outcome
// directly, and both untouched. A3 reads that column and must go on reading it.
//
// This is the OTHER one: what CareerRai's own tick records show, independent of
// anything the student said. The two are ALLOWED to disagree; that disagreement
// is a signal, and merging them into one column is what J1 forbids.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const run = (i: Parameters<typeof observedDayOutcome.produce>[0]) => observedDayOutcome.produce(i);

describe('what the tick record can and cannot say', () => {
  it('the whole plan finished outright is studied', () => {
    const r = run({
      completions: [{ task_id: 'a', confidence: 'green' }, { task_id: 'b', confidence: 'green' }],
      plannedTaskIds: ['a', 'b'], mockTaken: false,
    });
    expect(r.known && r.value).toBe('studied');
  });

  it('some of the plan is partial', () => {
    const r = run({
      completions: [{ task_id: 'a', confidence: 'green' }],
      plannedTaskIds: ['a', 'b'], mockTaken: false,
    });
    expect(r.known && r.value).toBe('partial');
  });

  it('ALL HALFWAY is partial, not studied', () => {
    // Uses completion-portion.ts, shipped today. The parked branch predates
    // that module and counted finishedness with its own local helper.
    const r = run({
      completions: [{ task_id: 'a', confidence: 'blue' }, { task_id: 'b', confidence: 'blue' }],
      plannedTaskIds: ['a', 'b'], mockTaken: false,
    });
    expect(r.known && r.value).toBe('partial');
  });

  it('a mock alone is partial — evidence of presence, not of a finished plan', () => {
    const r = run({ completions: [], plannedTaskIds: ['a'], mockTaken: true });
    expect(r.known && r.value).toBe('partial');
  });

  it('an empty plan is never "studied" — vacuous truth would claim a full day', () => {
    const r = run({ completions: [{ task_id: 'x', confidence: 'green' }], plannedTaskIds: [], mockTaken: false });
    expect(r.known && r.value).toBe('partial');
  });

  it('no ticks and no mock is UNKNOWN, never "not studied"', () => {
    // The core of J1: absence cannot be observed. A tick record has evidence of
    // presence or it has none -- it never has evidence of deliberate absence.
    const r = run({ completions: [], plannedTaskIds: ['a'], mockTaken: false });
    expect(r.known).toBe(false);
    expect(!r.known && r.reason).toBe('no_evidence');
  });

  it("cannot express 'skipped' or 'not_studied' at all", () => {
    const outcomes = new Set<string>();
    for (const mockTaken of [true, false]) {
      for (const conf of ['green', 'blue', 'yellow', 'red', null]) {
        const r = run({ completions: [{ task_id: 'a', confidence: conf }], plannedTaskIds: ['a'], mockTaken });
        if (r.known) outcomes.add(r.value);
      }
    }
    expect([...outcomes].sort()).toEqual(['partial', 'studied']);
  });
});

describe('the contract is enforced, not merely described', () => {
  it('declares where it reads from, and it is the tick record', () => {
    expect(observedDayOutcome.canonicalSource).toBe('observedBehaviour');
    expect(CANONICAL_SOURCES.observedBehaviour.table).toBe('routine_task_completions');
  });

  it('states every UNKNOWN condition up front', () => {
    expect(observedDayOutcome.unknownWhen.length).toBeGreaterThan(0);
  });

  it('carries provenance on both the known and unknown paths', () => {
    const k = run({ completions: [{ task_id: 'a', confidence: 'green' }], plannedTaskIds: ['a'], mockTaken: false });
    const u = run({ completions: [], plannedTaskIds: ['a'], mockTaken: false });
    for (const r of [k, u]) {
      expect(r.provenance.factKey).toBe('observed_day_outcome');
      expect(r.provenance.source).toBe('observedBehaviour');
      expect(r.provenance.inputs, 'the receipts a claim can cite').toBeTruthy();
    }
  });

  it('is pure — the registry cannot reach a database', () => {
    for (const f of ['registry.ts', 'contract.ts', 'canonical.ts']) {
      const s = read(`src/lib/facts/${f}`);
      const code = s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
      expect(code, `${f} must not query`).not.toMatch(/from\('|\.rpc\(|createAdminClient|createClient/);
      expect(code, `${f} must not read a clock`).not.toMatch(/new Date\(\)|Date\.now\(\)/);
    }
  });

  it('one definition per key', () => {
    // Re-cut 23 Aug (0C.3 Wave 1). This asserted the literal list
    // `['observed_day_outcome']`, so registering a SECOND, unrelated fact
    // failed it — a guard pinning the registry's CONTENTS instead of its
    // INVARIANT. The invariant is one definition per key, not one fact.
    // (Sixth time this repo has had to re-point a guard from characters to
    // the idea; the pattern is now itself worth watching for in review.)
    const keys = Object.values(FACTS).map((d) => d.key);
    expect(new Set(keys).size, 'a key is defined twice').toBe(keys.length);
    for (const [k, def] of Object.entries(FACTS)) {
      expect(def.key, `FACTS['${k}'] is filed under a name it does not declare`).toBe(k);
    }
    expect(FACTS.observed_day_outcome.key).toBe('observed_day_outcome');
  });
});

describe('it does not disturb the self-reported half', () => {
  it('A3 still reads the student-declared column', () => {
    const s = read('src/lib/check-in.ts');
    expect(s, 'dayWasStudied must still answer from day_outcome').toMatch(/export function dayWasStudied/);
    expect(s).toMatch(/row\.day_outcome/);
  });

  it('the writers of the declared column are untouched', () => {
    expect(read('src/components/check-in-gate.tsx')).toMatch(/day_outcome: finalOutcome/);
  });
});
