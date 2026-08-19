import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { creditedHours } from './study-credit';
import { VALID_SECTIONS } from './streak-utils';

// ── Off-plan study: the log sheet accepts a day that wasn't on the plan ─────
//
// Production, re-measured 19 Aug: 518 log opens by 233 students, 217
// dismissals (41.9%), 156 completions. The cause was in isValid --
//
//   taskChoice.size > 0 || mockTaken === true || rest
//
// Three ways to log a day: mark a PLAN topic, declare a mock, or declare a rest
// day. A student who studied real material the planner did not pick -- a
// coaching sheet, the chapter their class is on -- had no truthful option, and
// the hint told them to "mark how far you got on a plan topic", an instruction
// they could not honestly follow. Their choices were to lie, to claim a rest
// day they did not take, or to close the sheet.
//
// Same defect as J2, A3 and the check-in gate's unrepresentable zero: the
// system cannot record what actually happened, so the honest answer has nowhere
// to go. This is the most expensive instance, because here the cost is the
// whole log.
//
// It is also a DEPENDENCY OF Q5. Q5 hands a student who said "Studied" to this
// sheet to finish the duration; without an off-plan option the sheet could not
// accept the answer of anyone who studied off-plan, and they would land back on
// zero hours.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MODAL = 'src/components/DailyTracker/LoggingModal.tsx';

describe('off-plan study is recordable', () => {
  it('a day with only off-plan study can be submitted', () => {
    const s = read(MODAL);
    expect(s, 'isValid must accept off-plan alone')
      .toMatch(/const isValid = taskChoice\.size > 0 \|\| offPlanSections\.size > 0/);
  });

  it('the hint no longer instructs an impossible action', () => {
    const s = read(MODAL);
    expect(s, 'the old hint could not be honestly followed by an off-plan student')
      .not.toMatch(/Mark how far you got on a plan topic — or tell us you gave a mock\./);
    expect(s).toMatch(/a plan topic, something else you studied, or a mock/);
  });
});

describe('the vocabulary stays locked (J7)', () => {
  it('off-plan sections are a subset of the one section vocabulary', () => {
    const s = read(MODAL);
    const m = s.match(/const OFF_PLAN_SECTIONS = \[([^\]]*)\]/);
    expect(m, 'the list must be explicit, not computed').toBeTruthy();
    const listed = (m![1].match(/'([^']+)'/g) ?? []).map((x) => x.replace(/'/g, ''));
    expect(listed.length).toBeGreaterThan(0);
    for (const sec of listed) {
      expect(VALID_SECTIONS as readonly string[], `${sec} must be in the J7 vocabulary`).toContain(sec);
    }
  });

  it("'Mock' is deliberately absent — it is asked separately", () => {
    const s = read(MODAL);
    const m = s.match(/const OFF_PLAN_SECTIONS = \[([^\]]*)\]/);
    expect(m![1]).not.toMatch(/'Mock'/);
  });
});

describe('off-plan work earns credit, and cannot be double-counted as rest', () => {
  it('creditedHours already accepted offPlanCount — it just had no producer', () => {
    const withOff = creditedHours({ generatedHours: 4, plannedTasks: 4, fullDone: 0, halfDone: 0, offPlanCount: 2 });
    const without = creditedHours({ generatedHours: 4, plannedTasks: 4, fullDone: 0, halfDone: 0, offPlanCount: 0 });
    expect(withOff).toBeGreaterThan(without);
  });

  it('the sheet now feeds it the real count', () => {
    expect(read(MODAL)).toMatch(/offPlanCount: offPlanSections\.size/);
  });

  it('marking rest clears off-plan, and marking off-plan clears rest', () => {
    const s = read(MODAL);
    expect(s, 'rest must clear off-plan').toMatch(/toggleRest[\s\S]{0,220}setOffPlanSections\(new Set\(\)\)/);
    expect(s, 'off-plan must clear rest').toMatch(/toggleOffPlan[\s\S]{0,120}setRest\(false\)/);
  });
});

describe('off-plan coverage reaches the row', () => {
  it('the submitted sections include off-plan sections', () => {
    expect(read(MODAL)).toMatch(/\.\.\.offPlanSections,/);
  });

  it('a day of only off-plan study is not recorded as no work', () => {
    // deriveOutcome feeds day_outcome, which A3 reads to decide "did they
    // study?" and Q3 reads to decide whether the duration is measured.
    expect(read(MODAL)).toMatch(/marks\.length > 0 \|\| offPlanSections\.size > 0 \|\| mockTaken === true/);
  });

  it('the state resets after a submit', () => {
    expect(read(MODAL)).toMatch(/setOffPlanSections\(new Set\(\)\);\s*\n\s*setInitialDoneIds/);
  });
});
