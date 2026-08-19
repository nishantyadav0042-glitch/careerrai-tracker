import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeCapacity } from './capacity-engine';
import { durationIsUnknown } from './check-in';

// ── Q4: capacity stops counting days it could not measure as evidence ───────
//
// `computeCapacity` takes two log-derived inputs. `recentStudyHours` is ALREADY
// filtered `h > 0` inside the engine, so an unmeasured day contributes nothing
// to the magnitude and needs no change there. The defect is `loggedDays`,
// documented as "how many days had a report at all", which gates
// MIN_DAYS_FOR_BEHAVIOUR -- the threshold where we stop believing the hours a
// student TOLD us and start believing what they DID.
//
// A day where we never asked how long is not evidence of behaviour. Counting it
// meant a student could be judged against their own stated hours on the
// strength of days we never measured. Excluding it is faithful to the
// contract, not a change to it: loggedDays is an evidence count.
//
// Measured against production (21-day window): 224 logged days, 59 unmeasured
// dropped, behaviour tier 10 students -> 7, 3 students return to the input
// tier. Note this only became a real change once Q3 re-cut durationIsUnknown
// as a union -- under the stamp-only rule it would have dropped zero days.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('what counts as behaviour evidence', () => {
  it('a real declared zero IS behaviour and still counts toward the tier', () => {
    // Q2: "didn't study" and rest are behaviour. Excluding them would let a
    // student dodge the behaviour tier by honestly reporting bad days.
    expect(durationIsUnknown({ day_outcome: 'not_studied', study_duration: 0 })).toBe(false);
    expect(durationIsUnknown({ day_outcome: 'skipped', study_duration: 0 })).toBe(false);
  });

  it('a day we never measured is NOT behaviour evidence', () => {
    expect(durationIsUnknown({ day_outcome: 'studied', study_duration: 0 })).toBe(true);
  });
});

describe('the engine itself is unchanged — only its input is corrected', () => {
  it('below the threshold it trusts what the student entered', () => {
    const c = computeCapacity([4, 4], 2, 6);
    expect(c.trust).toBe('input');
    expect(c.sustainableHours).toBe(6);
  });

  it('at the threshold it believes behaviour when behaviour is lower', () => {
    const c = computeCapacity([2, 2, 2, 2, 2], 5, 6);
    expect(c.trust).toBe('behaviour');
    expect(c.sustainableHours).toBe(2);
  });

  it('dropping unmeasured days can move a student back to the input tier', () => {
    // Five logged days, two of which were never measured -> three measured.
    const withUnmeasured = computeCapacity([2, 2, 2], 5, 6);
    const measuredOnly = computeCapacity([2, 2, 2], 3, 6);
    expect(withUnmeasured.trust).toBe('behaviour');
    expect(measuredOnly.trust).toBe('input');
    expect(measuredOnly.sustainableHours).toBe(6);
  });

  it('never plans above what the student said', () => {
    const c = computeCapacity([9, 9, 9, 9, 9], 5, 4);
    expect(c.sustainableHours).toBe(4);
  });
});

describe('every capacity caller feeds it measured days', () => {
  for (const [name, path] of [
    ['routine/today', 'src/app/api/routine/today/route.ts'],
    ['student-360', 'src/lib/student-360.ts'],
    ['lis-health', 'src/lib/lis-health.ts'],
  ] as const) {
    it(`${name} counts measured days, not every logged row`, () => {
      const s = read(path);
      expect(s, 'must import the authority').toContain('durationIsUnknown');
      expect(s, 'must pass a measured-day count into computeCapacity')
        .toMatch(/computeCapacity\([^)]*measuredDays/);
    });

    it(`${name} selects the provenance column it now reads`, () => {
      expect(read(path), 'durationIsUnknown reads study_duration_source')
        .toContain('study_duration_source');
    });
  }
});

describe('scope containment', () => {
  it('the magnitude input is deliberately untouched', () => {
    // recentStudyHours/hrs still feed computeCapacity unchanged: the engine
    // already filters h > 0, and re-filtering here would double-count the rule.
    const s = read('src/app/api/routine/today/route.ts');
    expect(s).toMatch(/const recentStudyHours = \(recentReports \?\? \[\]\)\.map/);
  });

  it('the engine constants are unchanged', () => {
    const s = read('src/lib/capacity-engine.ts');
    expect(s).toContain('MIN_DAYS_FOR_BEHAVIOUR = 5');
    expect(s).toContain('CAPACITY_WINDOW_DAYS = 21');
  });
});
