import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── The tick on Home IS the log ─────────────────────────────────────────────
//
// 12 Aug 2026. Of 319 students who signed up in 45 days, 59 logged once and 5
// reached seven days. The single biggest leak was that recording a study day
// meant opening a separate sheet — so the 82% who never opened it read as
// students who never studied.
//
// Founder, 12 Aug: don't build a separate screen for filling the log — put a
// tick on the task itself. Tap it on the screen you already have open.
//
// Two rules this guard pins, because both have already cost us a cohort once:
//
//  1. ONE state. The tick means "I did this" and nothing else. No half, no
//     percentage, no partial — a second state would let the same tap mean two
//     things and would make the credited hours a guess.
//
//  2. ADDITIVE, never exclusive. Incident #2: the log modal could not be
//     submitted without ticking a plan-task, which made an honest off-plan or
//     zero-hour day impossible and took an entire cohort's logging to zero
//     (0/29). The sheet must remain fully usable on its own.

const CARD = 'src/components/DailyTracker/TodaysRoutineCard.tsx';

describe('the tick records the day', () => {
  it('the circles are real buttons, not decoration', () => {
    const src = readFileSync(CARD, 'utf8');
    // They were aria-hidden spans, deliberately inert, with completion pushed
    // into the log sheet. That is the thing being reversed.
    expect(src).not.toContain('Display only — completion happens in the log.');
    expect(src).toMatch(/aria-label=\{`Mark done: \$\{taskTitle\(task\)\}`\}/);
  });

  it('closes the day, so one tick counts as having logged', () => {
    const src = readFileSync(CARD, 'utf8');
    expect(src).toContain('close_day: true');
  });

  it('a mis-tap is reversible', () => {
    const src = readFileSync(CARD, 'utf8');
    expect(src).toMatch(/aria-label=\{done \? `Undo:/);
  });
});

describe('one meaning only', () => {
  it('the card never sends a partial/portion state', () => {
    const src = readFileSync(CARD, 'utf8');
    for (const forbidden of ['portion:', "'half'", 'percentComplete', 'partial:']) {
      expect(src, `tick must have a single meaning; found ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('the log sheet survives — Incident #2 must not repeat', () => {
  it('the modal is still valid without any plan-task ticked', () => {
    const modal = readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8');
    // A mock alone, or an honest rest day, is still a complete log.
    expect(modal).toContain('taskChoice.size > 0 || mockTaken === true || rest');
  });

  it('an honest zero-hour rest day is still submittable', () => {
    const modal = readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8');
    expect(modal).toMatch(/hours: 0/);
  });

  it('the routine write MERGES rather than overwriting an earlier manual log', () => {
    const route = readFileSync('src/app/api/routine/complete-task/route.ts', 'utf8');
    // A student who logged a real mock this morning must not lose it when they
    // tick a routine task tonight.
    expect(route).toContain('mergedHours');
    expect(route).toContain('Math.max');
  });
});
