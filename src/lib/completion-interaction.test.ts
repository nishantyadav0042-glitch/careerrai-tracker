import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  completionRequestFor, resolveTransition, portionOf, HALF_TICK_SIGNAL,
  type CompletionPortion, type TaskChoice,
} from './completion-portion';

// ── P0-2.3c — PARTIAL BECOMES REACHABLE ─────────────────────────────────────
//
// The server has supported PARTIAL -> FULL since P0-2.3a, and the portion has
// crossed the wire since P0-2.1. No student could trigger either, because both
// surfaces collapse a completion into a boolean:
//
//   TodaysRoutineCard  `done = completedIds.has(id)`, and ProgressChoice is
//                      gated on `!done` — so a PARTIAL, being "done", can
//                      never open the chooser that would upgrade it.
//
//   LoggingModal       pre-populates EVERY existing completion as 'full'
//                      (`new Map([...done].map((id) => [id, 'full']))`),
//                      regardless of its real portion. So a half-finished task
//                      renders as "Done" — a display lie — and on submit
//                      `choice && !wasDone` drops the upgrade silently.
//
// This file pins the client's half of the transition. `completionRequestFor`
// is the client mirror of `resolveTransition` and lives in the SAME module, so
// the two cannot drift into disagreeing about one tap.

const CELLS: { prior: CompletionPortion | null; choice: TaskChoice; sends: 'mark_full' | 'mark_half' | 'untick' | 'nothing' }[] = [
  { prior: null,   choice: 'full', sends: 'mark_full' },
  { prior: null,   choice: 'half', sends: 'mark_half' },
  { prior: null,   choice: null,   sends: 'nothing'   },
  { prior: 'half', choice: 'full', sends: 'mark_full' },
  { prior: 'half', choice: 'half', sends: 'nothing'   },
  { prior: 'half', choice: null,   sends: 'untick'    },
  { prior: 'full', choice: 'full', sends: 'nothing'   },
  { prior: 'full', choice: 'half', sends: 'nothing'   },
  { prior: 'full', choice: null,   sends: 'untick'    },
];

describe('the client sends exactly what the contract allows', () => {
  it('covers all nine cells', () => {
    for (const { prior, choice, sends } of CELLS) {
      const req = completionRequestFor('t1', prior, choice);
      const label = `${prior ?? 'untouched'} + ${choice ?? 'cleared'}`;
      if (sends === 'nothing') { expect(req, label).toBeNull(); continue; }
      expect(req, label).not.toBeNull();
      if (sends === 'untick') expect(req!.confidence, label).toBeUndefined();
      if (sends === 'mark_full') expect(portionOf(req!.confidence), label).toBe('full');
      if (sends === 'mark_half') expect(req!.confidence, label).toBe(HALF_TICK_SIGNAL);
    }
    expect(CELLS).toHaveLength(9);
  });

  it('the upgrade is sent, not swallowed', () => {
    const req = completionRequestFor('t1', 'half', 'full');
    expect(req).toEqual({ id: 't1', confidence: 'green' });
  });

  it('re-choosing halfway sends nothing at all — evidence cannot be lost in flight', () => {
    expect(completionRequestFor('t1', 'half', 'half')).toBeNull();
  });

  it('choosing halfway on a FULL task sends nothing — no regression is even attempted', () => {
    expect(completionRequestFor('t1', 'full', 'half')).toBeNull();
  });

  it('clearing a mark unticks either portion', () => {
    expect(completionRequestFor('t1', 'half', null)).toEqual({ id: 't1' });
    expect(completionRequestFor('t1', 'full', null)).toEqual({ id: 't1' });
  });
});

describe('client and server agree on every cell — one contract, two halves', () => {
  it('what the client sends produces the action the server contract expects', () => {
    for (const { prior, choice, sends } of CELLS) {
      const req = completionRequestFor('t1', prior, choice);
      if (!req) continue;
      const intent = req.confidence
        ? (portionOf(req.confidence) === 'half' ? 'mark_half' as const : 'mark_full' as const)
        : 'toggle' as const;
      const action = resolveTransition(prior, intent).action;
      const label = `${prior ?? 'untouched'} + ${choice ?? 'cleared'}`;
      if (sends === 'untick') expect(action, label).toBe('delete');
      if (sends === 'mark_full' && prior === 'half') expect(action, label).toBe('upgrade');
      if (sends === 'mark_full' && prior === null) expect(action, label).toBe('insert');
      if (sends === 'mark_half' && prior === null) expect(action, label).toBe('insert');
    }
  });

  it('the client never sends a request the server would refuse', () => {
    for (const { prior, choice } of CELLS) {
      const req = completionRequestFor('t1', prior, choice);
      if (!req?.confidence) continue;
      const intent = portionOf(req.confidence) === 'half' ? 'mark_half' as const : 'mark_full' as const;
      const r = resolveTransition(prior, intent);
      expect(r.action === 'none' && r.reason === 'regression_refused', `${prior} + ${choice}`).toBe(false);
    }
  });
});

describe("TodaysRoutineCard — a PARTIAL can be seen and upgraded", () => {
  const src = readFileSync(join(process.cwd(), 'src/components/DailyTracker/TodaysRoutineCard.tsx'), 'utf8');

  it('keeps the portion per task, not just a done set', () => {
    expect(src).toMatch(/partialIds|portionById/);
  });

  it('renders a PARTIAL distinctly from a FULL', () => {
    // Not colour alone: a word the student can read.
    expect(src).toMatch(/Halfway|halfway/);
  });

  it('does not strike through a PARTIAL — work happened, it is not finished', () => {
    // The invariant is ORDER: `partial` must be decided before the
    // line-through branch, so a half-finished task is never struck out.
    const idx = src.indexOf('line-through');
    expect(idx, 'the strike-through must still exist for a FULL task').toBeGreaterThan(-1);
    const clause = src.slice(Math.max(0, idx - 220), idx);
    expect(clause, 'partial must be tested before line-through is applied').toContain('partial ?');
  });

  it('opens the chooser for a PARTIAL so FULL is reachable', () => {
    // The old gate was `markingTaskId === task.id && !done`, which a PARTIAL
    // could never satisfy.
    expect(src).not.toMatch(/markingTaskId === task\.id && !done/);
  });

  it('offers an explicit removal rather than letting a repeat tap erase it', () => {
    expect(src).toMatch(/marked=|onRemove/);
  });

  it('a FULL task still unticks on tap and never opens the half chooser', () => {
    expect(src).toMatch(/if \(done && !partial\)/);
  });
});

describe('LoggingModal — the sheet stops claiming a PARTIAL is done', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/DailyTracker/LoggingModal.tsx'), 'utf8');

  it('no longer pre-populates every completion as full', () => {
    expect(src).not.toMatch(/new Map\(\[\.\.\.done\]\.map\(\(id\) => \[id, 'full' as const\]\)\)/);
  });

  it('seeds each task from its real portion', () => {
    expect(src).toMatch(/portion/);
  });

  it('builds its payload through the shared authority', () => {
    expect(src).toContain('completionRequestFor');
    expect(src, 'the wasDone gate dropped the upgrade')
      .not.toMatch(/if \(choice && !wasDone\)/);
  });
});
