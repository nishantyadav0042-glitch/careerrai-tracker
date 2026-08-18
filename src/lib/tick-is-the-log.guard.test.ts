import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { HALF_TICK_SIGNAL } from './completion-portion';

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
    // Still true, by two paths since P0-2.3c. A FULL task unticks on tap, as
    // it always has. A PARTIAL opens the chooser instead — so a stray tap
    // cannot erase the evidence that half the work happened — and gets an
    // explicit "Didn't do it" removal there. The rule this guard protects is
    // reversibility, not one particular aria-label.
    const src = readFileSync(CARD, 'utf8');
    expect(src, 'a full tick still unticks on tap').toMatch(/if \(done && !partial\) \{ void toggleTask\(task\); return; \}/);
    expect(src, 'a partial has an explicit removal').toMatch(/onRemove=\{\(\) => \{[^}]*toggleTask\(task\)/);
    expect(src).toMatch(/`Undo:/);
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
    //
    // The route's half literal moved behind HALF_TICK_SIGNAL on 18 Aug (P0-2),
    // which strengthens this rule rather than relaxing it: there is now ONE
    // authority for what 'blue' means, and completion-portion.test.ts asserts
    // the route carries no bare 'blue' of its own. The intent this guard has
    // always protected — one concept, one encoding — is unchanged; only the
    // place the encoding is spelled has.
    const route = readFileSync(ROUTE, 'utf8');
    expect(route).toMatch(/portion === 'half' \? HALF_TICK_SIGNAL/);
    expect(HALF_TICK_SIGNAL, 'the encoding itself must not drift').toBe('blue');
    // The sheet's inline mapping moved behind completionRequestFor in
    // P0-2.3c — the same authority the card and the server share. That
    // strengthens "one concept, one encoding": the sheet no longer spells the
    // encoding at all, and completion-interaction.test.ts walks all nine
    // client cells through the server's resolveTransition to prove they agree.
    const modal = readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8');
    expect(modal).toContain('completionRequestFor');
    expect(modal, 'the sheet must not re-spell the encoding').not.toMatch(/'green'\s*:\s*'blue'/);
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
    // The door moved into the plan card's footer on 18 Aug, so this now reads
    // the card. It is quieter there than it was before — a text link beside
    // "Busy day", not a bordered full-width button — which is MORE of an escape
    // hatch, so the rule holds in the direction it was written to hold.
    const card = readFileSync(CARD, 'utf8');
    expect(card).toMatch(/data-tour="log"[\s\S]{0,400}text-xs font-semibold text-stone-900/);
    expect(card, 'never the black primary button competing with the plan above it')
      .not.toMatch(/data-tour="log"[\s\S]{0,400}bg-stone-900 px-3 py-3/);
    // And it must sit with the day it describes, next to the other honest exit.
    expect(card).toMatch(/data-tour="log"[\s\S]{0,600}<BusyDayButton/);
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
    // THE Incident #2 invariant: a plan tick must never be required to submit.
    // Asserted structurally rather than as a literal string — the literal broke
    // on 18 Aug when a fourth valid path (off-plan sections) was added, which
    // strengthens the invariant rather than weakening it. A guard that fails
    // when the thing it protects gets MORE true is testing the wrong thing.
    const modal = readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8');
    const isValid = modal.slice(modal.indexOf('const isValid ='), modal.indexOf('const isValid =') + 200);
    expect(isValid, 'off-plan study alone must submit').toContain('offPlanSections.size > 0');
    expect(isValid, 'a mock alone must submit').toContain('mockTaken === true');
    expect(isValid, 'an honest rest day alone must submit').toContain('rest');
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
    //
    // The door MOVED on 18 Aug: the how-to-log strip that carried it was cut as
    // furniture, and the button now lives in the plan card's own footer beside
    // "Busy day". What this guard protects is that the door EXISTS and reaches
    // the log sheet — not which component renders it. Asserting the old file
    // would have passed a deletion that merely moved the label elsewhere.
    const card = readFileSync(CARD_SRC, 'utf8');
    expect(card, 'the visible door').toContain('Studied off-plan');
    expect(card, 'it must actually signal the app').toContain("new Event('cr-open-off-plan-log')");
    const app = readFileSync(APP, 'utf8');
    expect(app, 'and the app must answer that signal by opening the sheet')
      .toMatch(/addEventListener\('cr-open-off-plan-log'/);
    expect(app).toMatch(/openOffPlan[\s\S]{0,160}setIsLogOpen\(true\)/);
  });

  it('a mock alone is still a complete log', () => {
    // Pinned as an INVARIANT, not a literal expression. The old assertion
    // matched the exact isValid string, so adding a fourth valid path (off-plan
    // sections, 18 Aug) broke it even though every original path still worked.
    // What must stay true: a mock alone submits, and no plan tick is required.
    const modal = readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8');
    const isValid = modal.slice(modal.indexOf('const isValid ='), modal.indexOf('const isValid =') + 200);
    expect(isValid).toContain('mockTaken === true');
    expect(isValid).toContain('rest');
    expect(isValid, 'a plan tick must never be the ONLY way in')
      .toMatch(/\|\|/);
  });
});
