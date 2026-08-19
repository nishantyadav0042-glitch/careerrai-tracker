import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { portionOf, isFullyDone, planFullyDone, HALF_TICK_SIGNAL } from './completion-portion';

// ── A half-tick is PARTIAL, never fully complete (founder ruling, 18 Aug) ───
//
// The plan card and the log sheet both offer three states and label the middle
// one "Got halfway". The tap was read two ways twelve lines apart in one
// function: creditedHours counted it 0.5 (correct), day closure counted it
// FULLY DONE (wrong). A student who marked every task halfway closed the day,
// advanced their streak, and was told "Ready for tomorrow" -- having just said
// they only got halfway.
//
// Production context: 0 blue rows exist, because the CHECK constraint REJECTED
// 'blue' until 19 Aug 06:11. The UI has offered the control the whole time, so
// every half-tick before that was silently refused. The defect below is
// therefore about to become reachable for the first time, not historical.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('reading one completion', () => {
  it('blue is half', () => {
    expect(portionOf(HALF_TICK_SIGNAL)).toBe('half');
    expect(isFullyDone('blue')).toBe(false);
  });

  it('green is full', () => {
    expect(portionOf('green')).toBe('full');
    expect(isFullyDone('green')).toBe(true);
  });

  it('yellow and red are COMPLETED tasks the student found hard — still done', () => {
    // Deliberately not reclassified. That would be scope creep.
    expect(isFullyDone('yellow')).toBe(true);
    expect(isFullyDone('red')).toBe(true);
  });

  it('null is full — no partiality was ever expressed', () => {
    // All 29 null rows in production are 12-15 Jul, before the portion control
    // existed. A bare toggle sending neither confidence nor portion means the
    // same thing: a complete tick from a control that offered no alternative.
    // This is not absence of evidence.
    expect(portionOf(null)).toBe('full');
    expect(portionOf(undefined)).toBe('full');
  });
});

describe('did the student finish the whole plan?', () => {
  const ids = ['a', 'b', 'c'];

  it('every task fully done is done', () => {
    expect(planFullyDone(ids, [
      { task_id: 'a', confidence: 'green' },
      { task_id: 'b', confidence: null },
      { task_id: 'c', confidence: 'yellow' },
    ])).toBe(true);
  });

  it('ALL HALFWAY IS NOT DONE — the defect this exists to fix', () => {
    expect(planFullyDone(ids, [
      { task_id: 'a', confidence: 'blue' },
      { task_id: 'b', confidence: 'blue' },
      { task_id: 'c', confidence: 'blue' },
    ])).toBe(false);
  });

  it('one halfway among finished ones is still not done', () => {
    expect(planFullyDone(ids, [
      { task_id: 'a', confidence: 'green' },
      { task_id: 'b', confidence: 'green' },
      { task_id: 'c', confidence: 'blue' },
    ])).toBe(false);
  });

  it('a missing task is not done', () => {
    expect(planFullyDone(ids, [
      { task_id: 'a', confidence: 'green' },
      { task_id: 'b', confidence: 'green' },
    ])).toBe(false);
  });

  it('an empty plan is NOT vacuously finished', () => {
    // `[].every(...)` is true, which would close a day on no evidence at all.
    expect(planFullyDone([], [])).toBe(false);
  });

  it('completions for tasks not on the plan do not finish it', () => {
    expect(planFullyDone(ids, [
      { task_id: 'x', confidence: 'green' },
      { task_id: 'y', confidence: 'green' },
      { task_id: 'z', confidence: 'green' },
    ])).toBe(false);
  });
});

describe('the route uses the authority, and spells blue once', () => {
  it('day closure asks planFullyDone, not set membership', () => {
    const s = read('src/app/api/routine/complete-task/route.ts');
    expect(s, 'membership in completedIds is not completion')
      .not.toMatch(/const fullyDone = tasks\.every\(\(t\) => completedIds\.has\(t\.id\)\)/);
    expect(s).toMatch(/const fullyDone = planFullyDone\(/);
  });

  it("'blue' is not re-spelled in the route", () => {
    const s = read('src/app/api/routine/complete-task/route.ts');
    const codeOnly = s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(codeOnly, 'the half signal belongs to completion-portion.ts')
      .not.toMatch(/c\.confidence === 'blue'/);
  });

  it('hours still price a half-tick at half — that half was always right', () => {
    const s = read('src/app/api/routine/complete-task/route.ts');
    expect(s).toMatch(/halfDone/);
    expect(s).toMatch(/portionOf\(c\.confidence\) === 'half'/);
  });
});
