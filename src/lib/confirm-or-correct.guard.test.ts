import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';

// ── THE CHECK-IN SHOWS THE PLAN IT IS ASKING ABOUT ──────────────────────────
//
// The gate asked "how did yesterday go?" and showed nothing about what
// yesterday had asked for, so answering meant rebuilding the day from memory
// first. Measured 16 Sep: 4.36 tasks planned a day, 0.44 ticked, 83.7% of
// routines never touched — for most students the plan is the one thing they
// cannot recall, which makes it the one thing worth putting on the screen.
//
// Two properties have to survive every future edit:
//
//  1. A student with no routine for yesterday sees EXACTLY the screen they saw
//     before. The plan block is additive or it is a regression.
//  2. Ticking nothing produces the request the gate sent before this change.
//     The Q5 ruling stands: the gate has no field for how long, so it must
//     never imply one.

const read = (p: string) => codeOnly(readFileSync(join(process.cwd(), p), 'utf8'));
const GATE = 'src/components/check-in-gate.tsx';
const TRACKER = 'src/app/student/tracker/page.tsx';

describe('the student is shown what they planned', () => {
  const gate = read(GATE);

  it('renders yesterday\'s tasks on the answer screen', () => {
    expect(gate).toMatch(/plannedTasks\.map/);
    expect(gate).toMatch(/You planned/);
  });

  it('stays silent for a student who had no plan yesterday', () => {
    expect(gate, 'the plan block must be gated on having one')
      .toMatch(/plannedTasks\.length > 0 &&/);
    expect(gate, 'the prop must default to empty, never undefined-indexed')
      .toMatch(/plannedTasks = \[\]/);
  });

  it('asks which parts happened only for "Studied a bit"', () => {
    // The diagnostic answer: somebody who sat down and did not finish is
    // telling us WHICH parts happened. No other answer earns a second tap.
    expect(gate).toMatch(/askParts = outcome === 'partial' && plannedTasks\.length > 0/);
  });

  it('keeps that question optional and on the screen they already get', () => {
    expect(gate).toMatch(/\(optional\)/);
    // Rendered inside the follow-up branch, not as a new step.
    const askWhyBranch = gate.indexOf('What got in the way?');
    expect(gate.indexOf('Which parts did you get to?')).toBeGreaterThan(askWhyBranch);
  });
});

describe('the write is unchanged unless the student adds to it', () => {
  const gate = read(GATE);

  it('still claims no hours', () => {
    // Q5: posting hours the gate never asked for produced rows no consumer can
    // read and pushed finish dates out. It has no duration field; it must not
    // invent one.
    expect(gate).toMatch(/hours: 0/);
  });

  it('sends only sections the student ticked', () => {
    expect(gate).toMatch(/sections: doneSections/);
    expect(gate, 'doneSections is derived from the ticks, never from the plan')
      .toMatch(/plannedTasks\.filter\(\(t\) => didParts\.includes\(t\.id\)\)/);
  });

  it('never guesses a section it could not read', () => {
    expect(gate).toMatch(/filter\(\(x\): x is string => !!x\)/);
  });

  it('de-duplicates, because two tasks share a section routinely', () => {
    expect(gate).toMatch(/new Set\(/);
  });

  it('adds no second write path', () => {
    const fetches = [...gate.matchAll(/fetch\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(fetches.every((f) => f === '/api/logging/log-daily' || f.startsWith('/api/routine')),
      `unexpected write target: ${fetches.join(', ')}`).toBe(true);
  });
});

describe('the gate is asked about the same day it writes', () => {
  const tracker = read(TRACKER);

  it('derives yesterday exactly once', () => {
    // Two derivations could drift by one day between 03:00 and 05:29 IST, and
    // the gate would show one day's plan while logging a different day against
    // it. That off-by-one has already cost this codebase an incident.
    expect(tracker).toMatch(/const yesterdayStr = yesterdayForPlan/);
    expect(tracker).toMatch(/yesterdayForPlan = new Date\(Date\.parse\(getLogDateString\(\)\)/);
  });

  it('fetches the routine for that same day', () => {
    expect(tracker).toMatch(/\.eq\('routine_date', yesterdayForPlan\)/);
  });

  it('shape-checks the jsonb rather than trusting it', () => {
    // `tasks` is jsonb and an older row can hold anything at all.
    expect(tracker).toMatch(/typeof t\.id === 'string' && typeof t\.label === 'string'/);
  });
});
