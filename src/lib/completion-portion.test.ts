import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HALF_TICK_SIGNAL, portionOf, countsAsFullyDone,
} from './completion-portion';
import { creditedHours } from './study-credit';

// ── P0-2 — A HALF-TICK IS PARTIAL, NEVER COMPLETE ───────────────────────────
//
// Founder ruling, 18 Aug: "Half-tick = PARTIAL, not DONE."
//
// The plan card offers three states — not-marked / half / done — and labels the
// middle one "Got halfway". The 0C.3F.1 audit found the tap being read three
// different ways, four lines apart in one function:
//
//   hours            0.5 of a task       ← creditedHours. Correct, documented.
//   coverage ladder  +1 rung, cap        ← applyConfidenceSignal. Correct.
//                    `practicing`
//   DAY CLOSURE      FULLY DONE          ← fullyDone reads set membership and
//                                          never looks at confidence. WRONG,
//                                          undocumented, contradicts the label.
//
// So a student who marks every task "Got halfway" closes the day as fully
// done, advances the streak, and is credited half the hours.
//
// TIMING: production has 248 completions and ZERO half-ticks — 217 green, 29
// with no confidence at all, 2 struggle signals. Every consequence is latent,
// no student is affected, and there is no history to reconcile. This is the
// last moment the definition is free to lock; the first real half-tick makes
// it a migration.
//
// THE HISTORICAL RULE, stated explicitly rather than assumed:
//   A completion with confidence = null predates the portion control (all 29
//   are 12–15 Jul; the first green tick is 13 Jul). When they were written the
//   UI had no half option, so "ticked" meant "done". They are FULL, and they
//   are not silently upgraded into a new semantic they never carried.

describe('the three portions a stored completion can carry', () => {
  it('blue is half — the only partial signal', () => {
    expect(portionOf(HALF_TICK_SIGNAL)).toBe('half');
    expect(HALF_TICK_SIGNAL).toBe('blue');
  });

  it('green is full', () => {
    expect(portionOf('green')).toBe('full');
  });

  it('a null-confidence tick is FULL — two provenances, one meaning', () => {
    // 1. historical: 29 rows, 12 students, 12–15 Jul, before the half option.
    // 2. still live: a topicless task (Mock/General block) offers no portion
    //    choice, so a bare toggle inserts null today. 255 of 900 stored
    //    routines carry one. Both mean "no partiality was ever expressed".
    expect(portionOf(null)).toBe('full');
    expect(portionOf(undefined)).toBe('full');
  });

  it('leaves the struggle signals exactly as they are — not part of this ruling', () => {
    // yellow/red mark a completed task the student found hard. The founder
    // ruled on the half-tick; nothing here touches these, and pretending to
    // rule them would be the opportunistic cleanup the gate forbids.
    expect(portionOf('yellow')).toBe('full');
    expect(portionOf('red')).toBe('full');
  });
});

describe('only a full portion closes the day', () => {
  it('a half-tick does not count toward full completion', () => {
    expect(countsAsFullyDone(HALF_TICK_SIGNAL)).toBe(false);
  });

  it('everything else does — preserving all 248 existing rows exactly', () => {
    for (const c of ['green', 'yellow', 'red', null, undefined]) {
      expect(countsAsFullyDone(c), `${String(c)} must keep its current meaning`).toBe(true);
    }
  });
});

describe('hours already agreed with the ruling and must not move', () => {
  it('half a plan of half-ticks credits half the hours', () => {
    expect(creditedHours({ generatedHours: 4, plannedTasks: 4, fullDone: 0, halfDone: 4, offPlanCount: 0 })).toBe(2);
  });

  it('a full plan credits all of them', () => {
    expect(creditedHours({ generatedHours: 4, plannedTasks: 4, fullDone: 4, halfDone: 0, offPlanCount: 0 })).toBe(4);
  });
});

describe('the day-closure path reads the portion, not just the row', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/api/routine/complete-task/route.ts'), 'utf8');
  const code = route.split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

  it('fullyDone is computed from the portion', () => {
    expect(code).toContain('countsAsFullyDone');
    // The old shape — membership alone — must be gone.
    expect(code).not.toMatch(/tasks\.every\(\(t\) => completedIds\.has\(t\.id\)\)/);
  });

  it('the emergency minimum also requires a full portion', () => {
    // "Did the one essential task" cannot be satisfied by half of it, and it
    // must reach that answer through the same authority fullyDone uses.
    const block = code.slice(code.indexOf('const confidenceByTask'), code.indexOf('emergencyMinimumDone') + 200);
    expect(block).toContain('countsAsFullyDone');
    expect(code, 'the membership-only emergency check must be gone')
      .not.toMatch(/emergencyMinimumDone = emergencyDay && completedIds\.has/);
  });

  it('nothing in the route re-spells the half signal as a bare literal', () => {
    // One authority for what 'blue' means — the same law the coverage ladder
    // is under (covered-authority.guard.test.ts).
    expect(code).not.toMatch(/===\s*'blue'/);
    expect(code).not.toMatch(/'half'\s*\?\s*'blue'/);
  });

  it('the half count comes from the same authority as the full one', () => {
    const block = code.slice(code.indexOf('const halfDone'), code.indexOf('const halfDone') + 300);
    expect(block).toContain('portionOf');
  });
});

describe('the authority is a leaf and cannot be bypassed', () => {
  it('imports nothing, so anything may import it', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/completion-portion.ts'), 'utf8');
    expect(src).not.toMatch(/^import /m);
  });

  it('states the historical rule in the file, not only in a commit message', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/completion-portion.ts'), 'utf8');
    expect(src.toLowerCase()).toContain('null');
    expect(src).toMatch(/legacy|historical|before the/i);
  });
});
