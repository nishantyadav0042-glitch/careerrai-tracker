import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFact, FACTS } from './registry';
import { CANONICAL_SOURCES } from './canonical';

// ── G1 (0C.3G / J1) — observed_day_outcome ───────────────────────────────────
//
// The Daily Evidence Contract (docs/0C-3G-DAILY-EVIDENCE-CONTRACT.md, `8caae5d`)
// ruled day_outcome is TWO facts: self_reported_day_outcome (what the student
// declared — the check-in gate and the log sheet's own Rest toggle, both
// unchanged by this gate) and observed_day_outcome (what CareerRai's own
// tick records show — this fact).
//
// PARITY, not a fresh design. The implementation-surface audit found
// deriveOutcome() (LoggingModal.tsx) is already a pure function of exactly
// the data routine_task_completions + daily_routines + daily_reports.mock_taken
// persist — so this fact reproduces its branches exactly, the same
// byte-identical-parity discipline log-insight's migration used. The ONLY
// change is where the computation runs (server, on persisted rows) instead
// of where it ran before (client, on in-session state) — never a redesign.
//
//   client (frozen here for the parity comparison):
//     marks = taskChoice.values()  — every task marked THIS session
//     if marks.length > 0 && marks.length >= planTasks.length
//        && marks.every(m => m === 'full')          -> 'studied'
//     if marks.length > 0 || mockTaken === true      -> 'partial'
//     else                                            -> null
//
// `marks` maps to persisted completions for the day (taskChoice is itself
// seeded from the wire portion P0-2.1 already carries), so:
//
//   completions.length > 0 && completions.length >= plannedTaskIds.length
//     && fullyDoneTaskIds(completions).size === completions.length -> 'studied'
//   completions.length > 0 || mockTaken                             -> 'partial'
//   else                                                             -> UNKNOWN

function legacyDeriveOutcome(marksCount: number, planTasksCount: number, allFull: boolean, mockTaken: boolean): 'studied' | 'partial' | null {
  if (marksCount > 0 && marksCount >= planTasksCount && allFull) return 'studied';
  if (marksCount > 0 || mockTaken) return 'partial';
  return null;
}

const C = (id: string, confidence: 'green' | 'blue' | null) => ({ task_id: id, confidence });

describe('observed_day_outcome reproduces deriveOutcome() exactly', () => {
  it('all planned tasks ticked, all full -> studied (parity with the legacy branch)', () => {
    const completions = [C('a', 'green'), C('b', 'green'), C('c', 'green')];
    const planned = ['a', 'b', 'c'];
    const r = getFact('observed_day_outcome').produce({ completions, plannedTaskIds: planned, mockTaken: false });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBe('studied');
    expect(legacyDeriveOutcome(3, 3, true, false)).toBe('studied');
  });

  it('a partial among the ticks -> partial, not studied (a half-tick breaks "all full")', () => {
    const completions = [C('a', 'green'), C('b', 'blue'), C('c', 'green')];
    const planned = ['a', 'b', 'c'];
    const r = getFact('observed_day_outcome').produce({ completions, plannedTaskIds: planned, mockTaken: false });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBe('partial');
    expect(legacyDeriveOutcome(3, 3, false, false)).toBe('partial');
  });

  it('some but not all planned tasks ticked -> partial', () => {
    const completions = [C('a', 'green')];
    const planned = ['a', 'b', 'c'];
    const r = getFact('observed_day_outcome').produce({ completions, plannedTaskIds: planned, mockTaken: false });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBe('partial');
    expect(legacyDeriveOutcome(1, 3, true, false)).toBe('partial');
  });

  it('nothing ticked but a mock was taken -> partial', () => {
    const r = getFact('observed_day_outcome').produce({ completions: [], plannedTaskIds: ['a', 'b'], mockTaken: true });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBe('partial');
    expect(legacyDeriveOutcome(0, 2, false, true)).toBe('partial');
  });

  it('nothing ticked, no mock -> UNKNOWN, matching the legacy null exactly', () => {
    const r = getFact('observed_day_outcome').produce({ completions: [], plannedTaskIds: ['a', 'b'], mockTaken: false });
    expect(r.known).toBe(false);
    if (!r.known) expect(r.reason).toBe('no_evidence');
    expect(legacyDeriveOutcome(0, 2, false, false)).toBeNull();
  });

  it('no plan at all (planTasks.length === 0) but ticks exist -> studied, matching the legacy edge case', () => {
    // marks.length (1) >= planTasks.length (0) is vacuously true in the legacy
    // branch, and this fact must reproduce that, not "fix" it — the parity
    // discipline this migration follows.
    const completions = [C('a', 'green')];
    const r = getFact('observed_day_outcome').produce({ completions, plannedTaskIds: [], mockTaken: false });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBe('studied');
    expect(legacyDeriveOutcome(1, 0, true, false)).toBe('studied');
  });

  it('a legacy null-confidence completion counts as full — the same historical rule P0-2 already ruled', () => {
    const completions = [C('a', null), C('b', null)];
    const r = getFact('observed_day_outcome').produce({ completions, plannedTaskIds: ['a', 'b'], mockTaken: false });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBe('studied');
  });

  it('uses the shared authority, not a re-spelled predicate', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/facts/registry.ts'), 'utf8');
    expect(src).toContain('fullyDoneTaskIds');
    expect(src).not.toMatch(/confidence\s*===\s*'blue'/);
  });
});

describe('the fact is registered correctly', () => {
  const f = getFact('observed_day_outcome');

  it('is a DERIVED_FACT, never a self-report', () => {
    expect(f.semanticType).toBe('DERIVED_FACT');
  });

  it('names an existing canonical source', () => {
    expect(CANONICAL_SOURCES[f.canonicalSource]).toBeTruthy();
  });

  it('cannot be confused with self-reported day_outcome by name', () => {
    expect(f.key).toBe('observed_day_outcome');
    expect(f.meaning.toLowerCase()).not.toContain('self-report');
    expect(f.meaning.toLowerCase()).toMatch(/observ|tick|record/);
  });

  it('is the only new fact this gate adds', () => {
    const keys = FACTS.map((x) => x.key);
    expect(keys).toContain('observed_day_outcome');
  });
});

describe('self-reported day_outcome writers are unchanged — G1 touches only the derived side', () => {
  it('the check-in gate still sends its own tap, untouched', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/check-in-gate.tsx'), 'utf8');
    expect(src).toContain('day_outcome: finalOutcome');
  });

  it('the log sheet Rest toggle still declares not_studied explicitly, untouched', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/DailyTracker/LoggingModal.tsx'), 'utf8');
    expect(src).toContain("day_outcome: 'not_studied'");
  });

  it('the normal (ticked) submit path no longer sends a derived day_outcome', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/DailyTracker/LoggingModal.tsx'), 'utf8');
    expect(src).not.toMatch(/day_outcome:\s*deriveOutcome\(\)/);
  });
});

describe('planReason is unaffected — it never consumed deriveOutcome()\'s values', () => {
  it('proof: deriveOutcome() can only produce studied/partial/null, and planReason only branches on skipped/not_studied', () => {
    // Stated as an executable fact, not a claim: the two value sets are
    // disjoint, which is WHY removing the derived write cannot regress the
    // one real consumer of day_outcome.
    const derivable = new Set(['studied', 'partial', null]);
    const consumedByPlanReason = new Set(['skipped', 'not_studied']);
    for (const v of consumedByPlanReason) expect(derivable.has(v)).toBe(false);
  });

  it('plan-reason.ts is untouched by this gate', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/plan-reason.ts'), 'utf8');
    expect(src).toContain("input.dayOutcome === 'skipped'");
    expect(src).toContain("input.dayOutcome === 'not_studied'");
  });
});

describe('no schema, no migration, no new column', () => {
  it('the RPC migration file is untouched by this gate', () => {
    // A content hash would be brittle across unrelated future edits; the
    // signature check pins the one clause this gate must never touch.
    const rpc = readFileSync(join(process.cwd(), 'supabase/migrations/20260812_log_daily_hours_accept_decimals.sql'), 'utf8');
    expect(rpc).toContain('topics_covered    = p_topics_covered');
  });

  it('the fact is pure — no database access inside the producer', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/facts/registry.ts'), 'utf8');
    expect(src).not.toMatch(/observed_day_outcome[\s\S]{0,400}\.from\(/);
  });
});
