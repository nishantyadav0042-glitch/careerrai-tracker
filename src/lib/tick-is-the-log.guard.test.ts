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
    // Muted, not the black primary button competing with the plan above it.
    expect(app).toMatch(/data-tour="log"[\s\S]{0,400}bg-stone-50/);
    expect(app).not.toMatch(/data-tour="log"[\s\S]{0,400}bg-stone-900 px-3 py-3/);
  });

  it('the strip says nothing once the day is already recorded', () => {
    // "Today's Focus / Topics updated ✓" restated the ticks the student had
    // just tapped one card above. Founder, 13 Aug: remove it.
    const app = readFileSync('src/components/DailyTracker/DailyTrackerApp.tsx', 'utf8');
    expect(app).not.toContain('Topics updated');
    expect(app).not.toContain("Today's Focus");
  });

  it('new students are told how to log, on the plan itself', () => {
    // Reworded 13 Aug (founder: no jargon — "log" isn't a word students use;
    // say it in plain words). The hint must still exist and still point at
    // the circle; the exact phrasing is the plain-words version.
    const card = readFileSync(CARD, 'utf8');
    expect(card).toContain('Tap the circle');
    expect(card).toContain('your day is marked');
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
  // Removing the big log button left mock logging reachable only behind the
  // off-plan escape hatch — which does not read as "record your mock". A mock
  // is three hours plus the percentiles that feed every diagnostic we have;
  // it is the single highest-value thing a student records, and it briefly
  // had no name anywhere on Home.
  //
  // 13 Aug the door MOVED rather than closing. Founder: "whenever there is a
  // mock planned in the study plan add submit today's mock score in the study
  // plan only — there is no need of a different button for mock." So the rule
  // is unchanged and the address is new: the door is on the mock task.
  const APP = 'src/components/DailyTracker/DailyTrackerApp.tsx';
  const CARD_SRC = 'src/components/DailyTracker/TodaysRoutineCard.tsx';

  it('the plan names the mock explicitly, on the mock', () => {
    const card = readFileSync(CARD_SRC, 'utf8');
    expect(card).toContain('Add mock score');
    expect(card).toContain('isMockSitting(task)');
  });

  it('the standalone daily mock button is gone from Home', () => {
    // It was on screen 365 days a year for something that happens weekly.
    expect(readFileSync(APP, 'utf8')).not.toContain('Gave a mock');
  });

  it('finishing the day does not take the door with it', () => {
    // The completed state replaces the task list, and with it the button —
    // at the exact moment the paper has been sat and the score exists.
    expect(readFileSync(CARD_SRC, 'utf8')).toContain('routine.tasks.some(isMockSitting)');
  });

  it('the mock entry opens the sheet already on the mock', () => {
    const app = readFileSync(APP, 'utf8');
    expect(app).toContain('setLogWithMock(true)');
    expect(app).toContain('openWithMock={logWithMock}');
    const modal = readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8');
    expect(modal).toContain('if (openWithMock) setMockTaken(true)');
  });

  it('a saved score is SHOWN saved, at the spot it went in', () => {
    // Founder, 13 Aug, having just filled the sheet: "my mock score is
    // getting recorded nowhere — for sure." The row was in mock_debriefs,
    // percentiles correct — but the button still said "Add mock score", and
    // a save the student cannot see is indistinguishable from one that
    // failed. Once today's debrief exists the button becomes the recorded
    // percentile and links to the mock history.
    const card = readFileSync(CARD_SRC, 'utf8');
    expect(card).toContain('%ile saved');
    expect(card).toContain('/student/analysis?tab=mocks');
    const route = readFileSync('src/app/api/routine/today/route.ts', 'utf8');
    expect(route).toContain('todayMock');
    // And the proof appears within one breath of Submit — the debrief POST
    // busts the plan card's 30s cache via the shared refresh event.
    const app = readFileSync(APP, 'utf8');
    expect(app).toMatch(/pending-debrief[\s\S]{0,700}cr-routine-updated/);
  });

  it('the plan card and the sheet are wired to the same event name', () => {
    // They are siblings, not parent and child — a typo in either string
    // would silently produce a button that does nothing at all.
    expect(readFileSync(CARD_SRC, 'utf8')).toContain("new Event('cr-open-mock-log')");
    expect(readFileSync(APP, 'utf8')).toContain("addEventListener('cr-open-mock-log'");
  });

  it('off-plan study keeps its own separate door', () => {
    // Two different days. The off-plan sheet still carries the mock section
    // inside it, so an UNPLANNED mock is never unrecordable.
    expect(readFileSync(APP, 'utf8')).toContain('Studied off-plan');
  });

  it('a mock alone is still a complete log', () => {
    const modal = readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8');
    expect(modal).toContain('taskChoice.size > 0 || mockTaken === true || rest');
  });
});
