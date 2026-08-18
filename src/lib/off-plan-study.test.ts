import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { creditedHours } from './study-credit';

// ── The day the log sheet could not accept ──────────────────────────────────
//
// Production, 18 Aug: 216 students opened the log sheet, 97 never completed a
// single log, and 199 dismissals were recorded across 476 opens (41.8%).
// Of those dismissals, 153 (76.9%) touched NOTHING before closing — and the
// largest time bucket was 11-30 seconds with an average of 3.5 plan tasks on
// screen. They were not confused by a form; they read it and had no use for it.
//
// The cause is in `isValid`:
//
//     const isValid = taskChoice.size > 0 || mockTaken === true || rest;
//
// Three ways to log a day: mark a PLAN topic, declare a mock, or declare a rest
// day. A student who studied real material that is not on today's plan — a
// coaching sheet, a chapter their class is on, anything the planner did not
// pick — has no truthful option. The hint told them to "mark how far you got on
// a plan topic", which is a instruction they cannot honestly follow.
//
// This is the same defect as J2, A3 and the check-in gate's un-representable
// zero: the system has no way to record what actually happened, so the honest
// answer has nowhere to go. It is the most expensive instance, because here the
// cost is the entire log.
//
// `study-credit.ts` has anticipated this since it was written — `offPlanCount`
// is a documented first-class input ("Off-plan sections the student also
// studied — coverage still counts") that both writers hardcode to 0 because
// nothing collects it. This gate collects it.
//
// SECTION granularity, not topic: 0C.3G/J7 locked `topics_covered` to exactly
// one vocabulary — VARC | DILR | QA | Mock | Revision. Off-plan study enters
// through that same vocabulary or it re-opens the ruling.

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

const MODAL = 'src/components/DailyTracker/LoggingModal.tsx';

describe('a day that was not on the plan is still a loggable day', () => {
  it('off-plan sections alone make the log submittable', () => {
    const src = code(MODAL);
    expect(src, 'isValid must accept off-plan study as a real signal')
      .toMatch(/const isValid =[^;]*offPlanSections\.size > 0/);
  });

  it('the blocked-hint no longer instructs a student to do something untrue', () => {
    const src = code(MODAL);
    const hint = src.slice(src.indexOf('const missingHint'), src.indexOf('const missingHint') + 320);
    expect(hint, 'the old hint offered only plan-topic or mock')
      .not.toMatch(/^\s*'Mark how far you got on a plan topic — or tell us you gave a mock\.';/m);
    expect(hint.toLowerCase()).toMatch(/something else|off.plan|studied/);
  });

  it('off-plan sections reach topics_covered', () => {
    const src = code(MODAL);
    expect(src).toMatch(/finalSections|derived/);
    expect(src, 'the sections the student picked must be merged into what is sent')
      .toMatch(/offPlanSections/);
  });

  it('off-plan study is priced through the input study-credit already declares', () => {
    const src = code(MODAL);
    expect(src, 'offPlanCount was hardcoded to 0 while the UI could not collect it')
      .not.toMatch(/offPlanCount:\s*0\s*,/);
    expect(src).toMatch(/offPlanCount:\s*offPlanSections\.size/);
  });

  it('only the J7 vocabulary may be offered — no new section names', () => {
    const src = code(MODAL);
    const m = src.match(/OFF_PLAN_SECTIONS[^=]*=\s*\[([^\]]*)\]/);
    expect(m, 'the offered set must be an explicit, reviewable list').toBeTruthy();
    const listed = (m as RegExpMatchArray)[1].match(/'[A-Za-z]+'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
    // 'Mock' is excluded deliberately: the sheet already asks about mocks
    // separately, and offering it twice would let one mock be counted twice.
    expect(listed.sort()).toEqual(['DILR', 'QA', 'Revision', 'VARC']);
  });

  it('a rest day still clears off-plan marks — it is one or the other', () => {
    const src = code(MODAL);
    const toggle = src.slice(src.indexOf('const toggleRest'), src.indexOf('const toggleRest') + 260);
    expect(toggle, 'rest means nothing was studied, including off-plan')
      .toMatch(/setOffPlanSections/);
  });

  it('marking off-plan study clears a rest day, mirroring plan-topic marking', () => {
    const src = code(MODAL);
    expect(src).toMatch(/toggleOffPlan[\s\S]{0,220}setRest\(false\)/);
  });
});

describe('creditedHours already prices off-plan coverage — proving the input was live', () => {
  it('off-plan sections earn credit against the day plan', () => {
    const base = { generatedHours: 4, plannedTasks: 4, fullDone: 0, halfDone: 0 };
    expect(creditedHours({ ...base, offPlanCount: 0 })).toBe(0);
    expect(creditedHours({ ...base, offPlanCount: 2 })).toBe(2);
    expect(creditedHours({ ...base, offPlanCount: 4 })).toBe(4);
  });

  it('off-plan credit is capped at the day plan, exactly like plan credit', () => {
    expect(creditedHours({ generatedHours: 4, plannedTasks: 2, fullDone: 0, halfDone: 0, offPlanCount: 9 }))
      .toBe(4);
  });

  it('KNOWN EDGE, not fixed here: a no-plan day credits 0 however much was studied', () => {
    // plannedTasks = 0 returns 0 by design ("no syllabus work to price").
    // So an off-plan log on a day with no generated plan is still a LOG — it
    // counts as showing up, keeps the streak, records the sections — but earns
    // no hours. Changing that is a duration-semantics decision, which J6-A
    // reserves. Pinned so the behaviour is deliberate rather than discovered.
    expect(creditedHours({ generatedHours: 0, plannedTasks: 0, fullDone: 0, halfDone: 0, offPlanCount: 3 }))
      .toBe(0);
  });
});

describe('scope containment', () => {
  it('the plan-topic, mock and rest paths are untouched', () => {
    const src = code(MODAL);
    expect(src).toMatch(/taskChoice\.size > 0/);
    expect(src).toMatch(/mockTaken === true/);
    expect(src).toContain("day_outcome: 'not_studied'");
  });

  it('J6-A provenance is unchanged — off-plan hours are still credited', () => {
    const src = code(MODAL);
    expect(src).toMatch(/hours_source:\s*'credited'/);
    expect(src).toMatch(/hours_source:\s*'declared_zero'/);
  });

  it('no new migration', () => {
    expect(execSync('git status --porcelain supabase/migrations', { cwd: process.cwd() }).toString()).toBe('');
  });
});
