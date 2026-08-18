import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveTransition, type CompletionIntent, type CompletionPortion } from './completion-portion';

// ── P0-2.3a — THE COMPLETION TRANSITION ─────────────────────────────────────
//
// Founder rulings from P0-2.2, 18 Aug:
//   G4  re-tapping an existing PARTIAL means "still PARTIAL" — never delete
//   G7  PARTIAL -> FULL is an UPDATE to the existing row, not a second one
//   G2  FULL -> PARTIAL is prohibited; correction goes through untick
//
// WHAT WAS BROKEN: complete-task was a pure toggle keyed on row EXISTENCE and
// never looked at the portion —
//
//     if (existingCompletion) { DELETE } else { INSERT }
//
// so a student who marked a task "Got halfway", finished it later and tapped
// "Done" did not upgrade anything: the completion was DELETED and the task
// became untouched. PARTIAL -> FULL was not unimplemented, it was impossible,
// and attempting it destroyed the evidence that the student had done half.
//
// THE INTENT SIGNAL ALREADY EXISTS — no new API shape is needed:
//   · a request carrying `portion`/`confidence`  → MARK it that way
//   · a request carrying neither                 → TOGGLE (the untick gesture,
//     and the mark-done gesture for a task with no portion choice)
//
// Verified at every call site: TodaysRoutineCard passes a portion only from
// ProgressChoice (which renders only for un-marked tasks), and LoggingModal
// sends `confidence` only when `!wasDone`. So no client sends a portion for a
// row that already exists — which is why changing that case is safe.

const M: [CompletionPortion | null, CompletionIntent, string][] = [
  [null,   'mark_full', 'insert'],
  [null,   'mark_half', 'insert'],
  [null,   'toggle',    'insert'],
  ['half', 'mark_half', 'none'],
  ['half', 'mark_full', 'upgrade'],
  ['half', 'toggle',    'delete'],
  ['full', 'mark_full', 'none'],
  ['full', 'mark_half', 'none'],
  ['full', 'toggle',    'delete'],
];

describe('the transition matrix is total — every cell is decided', () => {
  it('covers all nine states', () => {
    for (const [current, intent, action] of M) {
      expect(resolveTransition(current, intent).action, `${current ?? 'none'} + ${intent}`).toBe(action);
    }
    expect(M).toHaveLength(9);
  });
});

describe('G7 — PARTIAL becomes FULL by UPDATE, never by a second row', () => {
  it('upgrades in place', () => {
    const r = resolveTransition('half', 'mark_full');
    expect(r.action).toBe('upgrade');
  });

  it('never resolves an upgrade to an insert', () => {
    // A second row would break the invariant P0-A established: one logical
    // completion for one student/task/day is ONE canonical row.
    expect(resolveTransition('half', 'mark_full').action).not.toBe('insert');
  });
});

describe('G4 — a repeated PARTIAL preserves the evidence', () => {
  it('re-marking halfway is a no-op, not a delete', () => {
    const r = resolveTransition('half', 'mark_half');
    expect(r.action).toBe('none');
    if (r.action === 'none') expect(r.reason).toBe('already_half');
  });

  it('cannot reach delete from a repeated half mark, ever', () => {
    expect(resolveTransition('half', 'mark_half').action).not.toBe('delete');
  });
});

describe('G2 — FULL never regresses to PARTIAL', () => {
  it('refuses the regression without deleting anything', () => {
    const r = resolveTransition('full', 'mark_half');
    expect(r.action).toBe('none');
    if (r.action === 'none') expect(r.reason).toBe('regression_refused');
  });

  it('a refused regression is not an error and not a delete', () => {
    // Same law as the coverage ladder: green/blue never move a topic down, and
    // a mis-tap is corrected by unticking, not by claiming less.
    const r = resolveTransition('full', 'mark_half');
    expect(r.action).not.toBe('delete');
    expect(r.action).not.toBe('upgrade');
  });
});

describe('marking is idempotent; the toggle is the only path to untouched', () => {
  it('re-marking a FULL task changes nothing', () => {
    const r = resolveTransition('full', 'mark_full');
    expect(r.action).toBe('none');
    if (r.action === 'none') expect(r.reason).toBe('already_full');
  });

  it('the explicit toggle still unticks either portion', () => {
    expect(resolveTransition('full', 'toggle').action).toBe('delete');
    expect(resolveTransition('half', 'toggle').action).toBe('delete');
  });

  it('a toggle on an absent row still marks it done', () => {
    // A task with no portion choice (a Mock block) is marked by a bare tap.
    // Its portion is full — the same answer the historical rule gives a stored
    // null, and for the same reason: nothing partial was ever expressed.
    const r = resolveTransition(null, 'toggle');
    expect(r.action).toBe('insert');
    if (r.action === 'insert') expect(r.portion).toBe('full');
  });

  it('inserts carry the portion the student actually chose', () => {
    const half = resolveTransition(null, 'mark_half');
    const full = resolveTransition(null, 'mark_full');
    expect(half.action === 'insert' && half.portion).toBe('half');
    expect(full.action === 'insert' && full.portion).toBe('full');
  });
});

describe('the route applies the matrix and holds no second authority', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/api/routine/complete-task/route.ts'), 'utf8');
  const code = src.split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

  it('resolves the transition instead of branching on row existence', () => {
    expect(code).toContain('resolveTransition');
    expect(code, 'the existence-keyed toggle must be gone')
      .not.toMatch(/if \(existingCompletion\) \{[\s\S]{0,120}\.delete\(\)/);
  });

  it('reads the stored portion to decide, not the raw signal', () => {
    expect(code).not.toMatch(/existingCompletion\.confidence\s*===/);
    expect(code).toContain('portionOf');
  });

  it('the upgrade is an update by natural key, never an insert', () => {
    const up = code.slice(code.indexOf("'upgrade'"), code.indexOf("'upgrade'") + 700);
    expect(up).toContain('.update(');
    expect(up).not.toContain('.insert(');
    expect(up, 'natural key, not the row id read a moment ago').toContain('task_id');
  });

  it('still selects the stored confidence — it cannot decide without it', () => {
    const sel = code.slice(code.indexOf("from('routine_task_completions')"),
      code.indexOf("from('routine_task_completions')") + 200);
    expect(sel).toContain('confidence');
  });

  it('keeps the 23505 convergence rule for the insert path', () => {
    expect(code).toContain("23505");
  });

  it('adds no second completion authority', () => {
    // completion-portion.ts is the leaf authority. No parallel enum, no
    // generic "completion status" abstraction.
    expect(code).not.toMatch(/===\s*'blue'/);
    expect(code).not.toMatch(/type\s+CompletionStatus/);
  });
});
