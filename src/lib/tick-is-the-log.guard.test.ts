import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── The tick on Home IS the log ─────────────────────────────────────────────
//
// 12 Aug 2026. Of 319 students who signed up in 45 days, 59 logged once and 5
// reached seven days. The single biggest leak was that recording a study day
// meant opening a separate sheet — so the 82% who never opened it read as
// students who never studied.
//
// Founder, 12 Aug: don't build a separate screen for filling the log — put the
// tick on the task itself, on the screen the student already has open.
// Founder, 13 Aug: and give it a SHORT SET of options, not one all-or-nothing
// tick — plus remove the old button entirely, because two doors to one action
// is a fork, not a convenience.
//
// Three rules this guard pins, each of which has already cost us something:
//
//  1. THREE STATES. not-marked / half / done. A single tick loses the most
//     common honest day: the student who got partway and would rather record
//     nothing than overclaim.
//
//  2. HALF MUST CREDIT HALF. The moment a partial state exists, the hours
//     formula has to know about it, or a half-finished block is banked as a
//     whole one — the log lying about time, which is Incident #30 read from
//     the other direction.
//
//  3. ADDITIVE, NEVER EXCLUSIVE. Incident #2: the log modal could not be
//     submitted without ticking a plan-task, which made an honest off-plan or
//     zero-hour day impossible and took an entire cohort's logging to 0/29.
//     The sheet stays fully usable on its own.

const CARD = 'src/components/DailyTracker/TodaysRoutineCard.tsx';
const ROUTE = 'src/app/api/routine/complete-task/route.ts';

describe('the tick records the day', () => {
  it('the circles are real buttons, not decoration', () => {
    const src = readFileSync(CARD, 'utf8');
    // They were aria-hidden spans, deliberately inert, with completion pushed
    // into the log sheet. That is the thing being reversed.
    expect(src).not.toContain('Display only — completion happens in the log.');
    expect(src).toMatch(/aria-label=\{`Mark progress: \$\{taskTitle\(task\)\}`\}/);
  });

  it('closes the day, so one mark counts as having logged', () => {
    expect(readFileSync(CARD, 'utf8')).toContain('close_day: true');
  });

  it('a mis-tap is reversible', () => {
    expect(readFileSync(CARD, 'utf8')).toMatch(/aria-label=\{done \? `Undo:/);
  });
});

describe('three states, and half means half', () => {
  it('the card offers a partial option, not just done', () => {
    const src = readFileSync(CARD, 'utf8');
    expect(src).toContain("onPick('half')");
    expect(src).toContain("onPick('full')");
  });

  it('the route accepts only the two real portions', () => {
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toMatch(/portion !== 'full' && portion !== 'half'/);
  });

  it('HALF CREDITS HALF — the route prices the day with the shared formula', () => {
    const src = readFileSync(ROUTE, 'utf8');
    // creditedHours counts a half at 0.5. The old minutes/60 rounding here
    // could not see partial work at all, so every half would have banked a
    // whole block's hours.
    expect(src).toContain('creditedHours(');
    expect(src).toContain('halfDone');
    expect(src).not.toMatch(/Math\.round\(routineMinutes \/ 60\)/);
  });

  it('uses the SAME representation the log sheet already uses', () => {
    // full -> green, half -> blue. One concept, one encoding, no new column.
    const route = readFileSync(ROUTE, 'utf8');
    expect(route).toMatch(/portion === 'half' \? 'blue'/);
    const modal = readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8');
    expect(modal).toContain("choice === 'full' ? 'green' : 'blue'");
  });

  it('never shrinks a log the student already made by hand', () => {
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toMatch(/Math\.max\(earned, existingLog\?\.study_duration \?\? 0\)/);
  });
});

describe('one door, not two', () => {
  it('the big log button is gone from Home', () => {
    const app = readFileSync('src/components/DailyTracker/DailyTrackerApp.tsx', 'utf8');
    expect(app).not.toContain('Update topics studied today');
  });

  it('what replaced it reads as an escape hatch, not a call to action', () => {
    const app = readFileSync('src/components/DailyTracker/DailyTrackerApp.tsx', 'utf8');
    expect(app).toContain('Studied something else today?');
    // No longer the black primary button competing with the plan.
    expect(app).not.toMatch(/data-tour="log"[\s\S]{0,400}bg-stone-900 px-3 py-3/);
  });

  it('new students are told how to log, on the plan itself', () => {
    const card = readFileSync(CARD, 'utf8');
    expect(card).toContain("that&apos;s your log for today");
  });
});

describe('the log sheet survives — Incident #2 must not repeat', () => {
  it('the modal is still valid without any plan-task ticked', () => {
    const modal = readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8');
    expect(modal).toContain('taskChoice.size > 0 || mockTaken === true || rest');
  });

  it('an honest zero-hour rest day is still submittable', () => {
    expect(readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8')).toMatch(/hours: 0/);
  });

  it('the sheet is still reachable from Home', () => {
    const app = readFileSync('src/components/DailyTracker/DailyTrackerApp.tsx', 'utf8');
    expect(app).toContain('setIsLogOpen(true)');
  });
});

describe('a mock must always have a door of its own', () => {
  // Removing the big log button left mock logging reachable only behind
  // "Studied something else today?" — which does not read as "record your
  // mock". A mock is three hours plus the percentiles that feed every
  // diagnostic we have; it is the single highest-value thing a student
  // records, and it briefly had no name anywhere on Home.
  const APP = 'src/components/DailyTracker/DailyTrackerApp.tsx';

  it('Home names the mock explicitly', () => {
    expect(readFileSync(APP, 'utf8')).toContain('Gave a mock');
  });

  it('the mock entry opens the sheet already on the mock', () => {
    const app = readFileSync(APP, 'utf8');
    expect(app).toContain('setLogWithMock(true)');
    expect(app).toContain('openWithMock={logWithMock}');
    const modal = readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8');
    expect(modal).toContain('if (openWithMock) setMockTaken(true)');
  });

  it('off-plan study keeps its own separate door', () => {
    // Two different days, two different entries — collapsing them is what
    // hid the mock in the first place.
    expect(readFileSync(APP, 'utf8')).toContain('Studied off-plan');
  });

  it('a mock alone is still a complete log', () => {
    const modal = readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8');
    expect(modal).toContain('taskChoice.size > 0 || mockTaken === true || rest');
  });
});
