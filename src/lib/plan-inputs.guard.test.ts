import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── EVERY PLAN INPUT MUST HAVE SOMETHING THAT FILLS IT ──────────────────────
//
// Founder, 14 Aug: "you should build different plan for different individuals
// — when they tap in onboarding you should take different paths from there.
// Build things smartly and more organized."
//
// He was right, and the production audit is why this file exists. The planner
// reads a rich set of inputs and has a documented fallback chain for the most
// important one:
//
//   mock → self-report → baseline → coverage grid → DILR
//
// Measured across 326 onboarded students on 14 Aug:
//
//   hours                 326 / 326
//   finish date           326 / 326
//   working professional  326 / 326
//   repeater              326 / 326
//   self-reported weakest   0 / 326   ← nothing asked it
//   baselines               0 / 326   ← nothing asked it
//   weak topic              0 / 326
//   current stage           0 / 326
//   biggest blocker         0 / 326
//   start_with              8 / 326
//
// Three of the four rungs above the coverage grid were empty for EVERY
// student, so 78 of 326 (24%) fell all the way through to the hard-coded DILR
// default. Their "personalised" plan was the fallback path, and nothing
// anywhere reported it — the code looked personalised, the product was not.
//
// A branch nobody feeds is not personalisation, it is dead code that reads
// like a feature. This guard makes that state impossible to reach silently.

const MODAL = 'src/app/student/onboarding/onboarding-modal.tsx';
const SCREEN = 'src/app/student/onboarding/screens/screen-weakest-section.tsx';
const PLAN_DAY = 'src/lib/plan-day.ts';
const FOCUS = 'src/lib/focus-sections.ts';

describe('the weakest section is ASKED, not defaulted', () => {
  it('onboarding has a screen for it', () => {
    const s = readFileSync(MODAL, 'utf8');
    expect(s).toContain("key: 'weakest-section'");
    expect(s).toContain('ScreenWeakestSection');
  });

  it('the answer is written to the profile', () => {
    // The whole defect was a field the planner read and nothing wrote.
    const s = readFileSync(MODAL, 'utf8');
    expect(s).toContain('self_reported_weakest_section:');
    expect(s).toContain("from('profiles')");
  });

  it('the save is keyed on the field being PRESENT, never on it being truthy', () => {
    // "Not sure" is a real answer that stores null. A truthiness check would
    // drop it and leave the student on the very default this screen exists to
    // escape — the same class of bug as the reorder that once wrote
    // full_name = null.
    const s = readFileSync(MODAL, 'utf8');
    expect(s).toContain("'self_reported_weakest_section' in data");
  });

  it('offers all three sections and an honest "not sure"', () => {
    const s = readFileSync(SCREEN, 'utf8');
    for (const sec of ['VARC', 'DILR', 'QA']) expect(s, sec).toContain(`value: '${sec}'`);
    // Not sure stores null and falls through to the grid — no worse than
    // before, and it never poisons the strongest input with a guess.
    expect(s).toContain('submit(null)');
  });

  it('is asked BEFORE the coverage grid', () => {
    // Weakness and coverage are different questions. The gut answer comes
    // first; the grid then refines what to study within it.
    const s = readFileSync(MODAL, 'utf8');
    expect(s.indexOf("key: 'weakest-section'")).toBeLessThan(s.indexOf("key: 'topic-coverage'"));
  });
});

describe('the chain that consumes it still ranks evidence over memory', () => {
  it('a real mock still outranks the self-report', () => {
    const file = readFileSync(FOCUS, 'utf8');
    const chain = file.slice(file.indexOf('export function resolveFocusSections'));
    expect(chain.indexOf('mock?.weakest')).toBeLessThan(chain.indexOf('self_reported_weakest_section'));
  });

  it('the self-report outranks the coverage grid', () => {
    // The grid measures COVERAGE; this measures WEAKNESS. A student can have
    // covered all of DILR and still lose marks there.
    const file = readFileSync(FOCUS, 'utf8');
    const chain = file.slice(file.indexOf('export function resolveFocusSections'));
    expect(chain.indexOf('self_reported_weakest_section')).toBeLessThan(chain.indexOf('weakestFromCoverage('));
  });

  it('DILR is still the last resort, and only the last resort', () => {
    const file = readFileSync(FOCUS, 'utf8');
    const chain = file.slice(file.indexOf('export function resolveFocusSections'));
    expect(chain.indexOf("?? 'DILR'")).toBeGreaterThan(chain.indexOf('weakestFromCoverage('));
  });
});

// The rule the rest of this file enforces. If the planner starts reading a
// new profile field, onboarding or an in-app prompt must write it — otherwise
// it is a branch that exists in code and never in a student's plan.
//
// Founder's sequencing: weakest section in onboarding, the rest collected in
// the first week rather than front-loading the funnel. So a field listed here
// as "first week" is a commitment, not a gap — and the second describe block
// below is what makes that literally true rather than aspirational.
const INPUTS: { field: string; filledBy: 'onboarding' | 'first-week' | 'derived' }[] = [
  { field: 'study_target_hours', filledBy: 'onboarding' },
  { field: 'weekend_hours_available', filledBy: 'onboarding' },
  { field: 'syllabus_target_date', filledBy: 'onboarding' },
  { field: 'is_working_professional', filledBy: 'onboarding' },
  { field: 'is_repeater', filledBy: 'onboarding' },
  { field: 'target_percentile', filledBy: 'onboarding' },
  { field: 'attempt_year', filledBy: 'onboarding' },
  { field: 'self_reported_weakest_section', filledBy: 'onboarding' },
  { field: 'self_reported_weak_topic', filledBy: 'first-week' },
  { field: 'current_stage', filledBy: 'first-week' },
  { field: 'start_with', filledBy: 'first-week' },
  { field: 'plan_source', filledBy: 'derived' },
];

describe('no plan input is read without something that fills it', () => {
  it('every field the day-builder maps is on the list', () => {
    // Scoped to real property reads in CODE — `profile.x as T` / `profile.x)` /
    // `profile.x,` — so prose in the comments above them cannot register as an
    // input and quietly weaken the check.
    const s = readFileSync(PLAN_DAY, 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    const mapped = [...s.matchAll(/profile\.([a-z_]{4,})\s*(?:as|\)|,|;|\?\?)/g)].map((m) => m[1]);
    const known = new Set(INPUTS.map((i) => i.field));
    const unlisted = [...new Set(mapped)].filter((f) => !known.has(f));
    expect(
      unlisted,
      `plan-day reads ${JSON.stringify(unlisted)} — add it to INPUTS and make sure something FILLS it`,
    ).toEqual([]);
  });

  it('every onboarding-filled input is actually written during onboarding', () => {
    const s = readFileSync(MODAL, 'utf8');
    // The two hours columns are deliberately NOT written by name here: they go
    // through lib/daily-hours.setDailyHours, the single owner of that number
    // for the whole app. Writing them directly would be the regression.
    const VIA_OWNER: Record<string, string> = {
      study_target_hours: 'setDailyHours(',
      weekend_hours_available: 'setDailyHours(',
    };
    for (const i of INPUTS.filter((x) => x.filledBy === 'onboarding')) {
      const needle = VIA_OWNER[i.field] ?? i.field;
      expect(s.includes(needle), `${i.field} is never written in onboarding (looked for "${needle}")`).toBe(true);
    }
  });

  it('hours are written ONLY through their owner module', () => {
    const s = readFileSync(MODAL, 'utf8');
    expect(s).toContain('setDailyHours(');
    // A direct column write here would be a second writer of the number the
    // whole plan is sized from.
    expect(s).not.toContain('study_target_hours:');
    expect(s).not.toContain('weekend_hours_available:');
  });
});

// ── THE FIRST-WEEK COLLECTION IS ACTUALLY WIRED ──────────────────────────────
//
// Founder, 14 Aug: "ask weakest section in onboarding, rest in first week."
// The three fields deferred here are recorded above as commitments, not
// gaps — this is what makes that true rather than aspirational.
describe('the "rest in first week" commitment is kept', () => {
  const ASKS = 'src/lib/first-week-asks.ts';
  const CARD = 'src/components/first-week-ask-card.tsx';
  const API = 'src/app/api/student/first-week-ask/route.ts';
  const ROUTE = 'src/app/api/routine/today/route.ts';
  const TRACKER = 'src/components/DailyTracker/TodaysRoutineCard.tsx';

  it('an ask exists for every field deferred to first-week', () => {
    const s = readFileSync(ASKS, 'utf8');
    for (const i of INPUTS.filter((x) => x.filledBy === 'first-week')) {
      expect(s.includes(`field: '${i.field}'`), `no ask defined for ${i.field}`).toBe(true);
    }
  });

  it('the API writes to the field the ask declares, not a hand-typed one', () => {
    // If this route ever hand-writes a column name instead of reading
    // ask.field, a renamed or added ask silently stops being persisted.
    const s = readFileSync(API, 'utf8');
    expect(s).toContain('[ask.field]');
  });

  it('a null answer is accepted — an honest "I don\'t know" is still an answer', () => {
    const s = readFileSync(API, 'utf8');
    expect(s).toMatch(/value\s*!==\s*null\s*&&\s*typeof value\s*!==\s*'string'/);
  });

  it('the tracker route exposes what the ask card needs to decide', () => {
    const s = readFileSync(ROUTE, 'utf8');
    expect(s).toContain('weakestSection: weakest');
    expect(s).toContain('firstWeekAsk:');
    expect(s).toContain('daysSinceSignup');
    expect(s).toContain('daysLogged');
  });

  it('the card is actually rendered on the plan the student sees', () => {
    const s = readFileSync(TRACKER, 'utf8');
    expect(s).toContain('FirstWeekAskCard');
    expect(s).toContain('data.firstWeekAsk');
  });

  it('skipping is client-only — it must never write a false "declined" to the profile', () => {
    // A DB null cannot be told apart from "never asked", so a skip that wrote
    // null would look identical to an unanswered field and silently satisfy
    // the "every input has something that fills it" rule without the input
    // actually being filled.
    const s = readFileSync(CARD, 'utf8');
    expect(s).toContain('saveDismissed(');
    expect(s).not.toMatch(/skip[\s\S]{0,120}fetch\(/);
  });
});

// ── "YOUR DATE DOESN'T WORK" IS SAID, NOT SWALLOWED ─────────────────────────
//
// Founder, 14 Aug, option (a), second half: "if the date is too close, tell
// them the date doesn't work." Reaching all 46 topics (topic-reachability.gate)
// is only honest when there is time; this is what happens when there is not.
describe('the finish-date warning reaches the student and never moves anything', () => {
  const ROUTE = 'src/app/api/routine/today/route.ts';
  const TRACKER = 'src/components/DailyTracker/TodaysRoutineCard.tsx';

  it('the route computes it from the real feasibility engine', () => {
    const s = readFileSync(ROUTE, 'utf8');
    expect(s).toContain('assessFinishDate(');
    expect(s).toContain('feasibilityMessage(');
    expect(s).toContain('finishDate:');
  });

  it('is scoped to what the day was actually built to, not a recomputed guess', () => {
    const s = readFileSync(ROUTE, 'utf8');
    const block = s.slice(s.indexOf('finishDate: (() => {'), s.indexOf('because,'));
    expect(block).toContain('hoursPerDay: hoursToday');
    expect(block).toContain('daysToTarget: daysToSyllabusTarget');
  });

  it('never writes to syllabus_target_date — the student\'s date is theirs alone', () => {
    const s = readFileSync(ROUTE, 'utf8');
    const block = s.slice(s.indexOf('finishDate: (() => {'), s.indexOf('because,'));
    expect(block).not.toMatch(/\.update\(/);
    expect(block).not.toContain('syllabus_target_date:');
  });

  it('is rendered on the plan the student is looking at', () => {
    const s = readFileSync(TRACKER, 'utf8');
    expect(s).toContain('data.finishDate');
    expect(s).toMatch(/finishDate\.headline/);
  });
});
