import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeStatus, highestStatus, STATUS_ORDER, isForwardMove, type CoverageStatus } from './coverage-status';
import { applyConfidenceSignal } from './topic-selector';

// ── The Coverage Matrix is the planner's memory ─────────────────────────────
//
// Every topic choice is made from it. A silent corruption here does not throw,
// does not log, and does not show up until a student notices the app has
// forgotten a chapter they finished weeks ago — by which point the damage is
// spread across every plan since. Backbone audit, 13 Aug, found three ways to
// corrupt it and this file is what keeps them shut.

describe('an unrecognised stored status can never erase a topic', () => {
  // The bug: call sites did STATUS_ORDER.indexOf(row.status) and then indexed
  // the array with the result. Any value off the ladder is -1, so
  // STATUS_ORDER[-1 + 1] === 'not_started' — a "Finished it" tap DELETED the
  // student's progress — and STATUS_ORDER[-1] is undefined, written straight
  // back to the row.
  it('the legacy name for the top rung survives as the top rung', () => {
    expect(normalizeStatus('mastered')).toBe('exam_ready');
  });

  it('every real status passes through untouched', () => {
    for (const s of STATUS_ORDER) expect(normalizeStatus(s)).toBe(s);
  });

  it('genuine garbage floors instead of producing undefined', () => {
    for (const junk of [null, undefined, '', 'banana', 42, {}, []]) {
      expect(STATUS_ORDER).toContain(normalizeStatus(junk));
    }
  });

  it('a confidence tap on an unrecognised row never returns undefined', () => {
    for (const c of ['green', 'blue', 'yellow', 'red'] as const) {
      const out = applyConfidenceSignal('mastered' as unknown as CoverageStatus, c);
      expect(STATUS_ORDER, `${c} on a legacy row produced ${out}`).toContain(out);
    }
  });

  it('THE REGRESSION: "Finished it" on a legacy row does not wipe it', () => {
    // Pre-fix this returned 'not_started'.
    expect(applyConfidenceSignal('mastered' as unknown as CoverageStatus, 'green')).not.toBe('not_started');
    expect(applyConfidenceSignal('mastered' as unknown as CoverageStatus, 'blue')).not.toBe('not_started');
  });
});

describe('an advancing tap may lift a topic, never drop it', () => {
  it('highestStatus keeps the further-along of the two', () => {
    expect(highestStatus('revising', 'learning')).toBe('revising');
    expect(highestStatus('learning', 'revising')).toBe('revising');
    expect(highestStatus('practicing', 'practicing')).toBe('practicing');
  });

  it('green and blue never move any status backwards', () => {
    for (const from of STATUS_ORDER) {
      for (const c of ['green', 'blue'] as const) {
        const to = applyConfidenceSignal(from, c);
        expect(isForwardMove(from, to), `${c} moved ${from} → ${to}`).toBe(true);
      }
    }
  });

  it('and neither can claim exam_ready, which is earned from evidence alone', () => {
    for (const from of STATUS_ORDER) {
      if (from === 'exam_ready') continue;
      for (const c of ['green', 'blue'] as const) {
        expect(applyConfidenceSignal(from, c)).not.toBe('exam_ready');
      }
    }
  });
});

describe('the tick route may not corrupt the matrix on a failed read', () => {
  const SRC = 'src/app/api/routine/complete-task/route.ts';

  it('a failed coverage read skips the advance instead of guessing', () => {
    // It was unchecked, so a transient failure gave `undefined`, read as
    // "never started" — ticking a task rewrote a 'revising' topic to
    // 'learning'. Losing an update is recoverable; corrupting the planner's
    // memory is not.
    const src = readFileSync(SRC, 'utf8');
    expect(src).toContain('readErr');
    expect(src).toMatch(/if \(readErr\)/);
  });

  it('the write is floored so a tick can only ever advance', () => {
    expect(readFileSync(SRC, 'utf8')).toContain('highestStatus(normalizeStatus(current), advanced)');
  });

  it('the tick itself fails loudly — it IS the log', () => {
    // A green circle over an empty table is the worst outcome on this route:
    // the student believes the day is recorded and finds out via a wrong
    // streak days later.
    const src = readFileSync(SRC, 'utf8');
    expect(src).toContain('insErr');
    expect(src).toContain('Could not save that tick');
    const card = readFileSync('src/components/DailyTracker/TodaysRoutineCard.tsx', 'utf8');
    expect(card).toContain('setTickError');
  });
});

describe('the weekly review cannot downgrade what it cannot read', () => {
  const SRC = 'src/app/api/coverage/weekly-review/route.ts';

  it('normalises rather than flattening an unknown status to the bottom rung', () => {
    // Flattening made isForwardMove wave through ANY tap, so the one screen
    // we made mandatory was also the one that could silently downgrade a
    // finished topic.
    const src = readFileSync(SRC, 'utf8');
    expect(src).toContain('normalizeStatus(r.status)');
    expect(src).not.toContain("isCoverageStatus(r.status) ? r.status : 'not_started'");
  });

  it('stamps updated_at like every other writer', () => {
    // Without it a topic changed through the review never counted as
    // "touched", so the next review would not resurface it and revision-due
    // recency never learned the student had moved it.
    expect(readFileSync(SRC, 'utf8')).toContain('updated_at: nowIso');
  });

  it('still refuses a self-declared exam_ready', () => {
    expect(readFileSync(SRC, 'utf8')).toMatch(/status === 'exam_ready'[\s\S]*?rejected\+\+/);
  });
});

describe('the plan never claims something that did not happen', () => {
  it('busy day only prints a new finish date when the write landed', () => {
    // The error was logged and the response still said shifted, so the button
    // printed "New finish date: 21 Aug" over a profile that never changed.
    const src = readFileSync('src/app/api/routine/busy-day/route.ts', 'utf8');
    expect(src).toContain('dateShifted');
    expect(src).toContain('newTargetDate: dateShifted ? verdict.newTargetDate : null');
  });

  it('the calibration tap does not promise a plan change it cannot make', () => {
    // Nothing in the engine reads daily_routines.calibration — and it cannot
    // honestly be wired the obvious way, because acting on "too much" means
    // shrinking the day, which the hours-are-sacred rule forbids.
    const card = readFileSync('src/components/DailyTracker/TodaysRoutineCard.tsx', 'utf8');
    const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('this tunes tomorrow');
  });
});
