import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeCapacity } from './capacity-engine';

// ── Q4 — capacity must not count a day it could not measure ─────────────────
//
// Founder ruling: apply the same pair-aware rule, and measure tier movement.
//
// WHAT THE EXISTING CONTRACT ALREADY SAYS (checked before changing anything,
// as instructed). `computeCapacity` takes TWO inputs derived from logs:
//
//   recentStudyHours — already filtered `h > 0` inside the engine, because
//                      typicalStudyHours is documented as "median hours on days
//                      they actually studied". An unmeasured day therefore
//                      ALREADY contributes nothing to the magnitude. No change
//                      is needed or made there.
//
//   loggedDays       — "days with a report in the window", gating
//                      MIN_DAYS_FOR_BEHAVIOUR (5), the point at which we stop
//                      believing what the student told us and start believing
//                      what they did.
//
// The defect is in the second. A day where we never asked how long is not
// evidence of behaviour, but it counts toward the threshold that overrides the
// student's own stated hours. So a student can be judged "by behaviour" on the
// strength of days we never measured.
//
// A real zero ('didn't study' / rest) IS behaviour evidence and still counts.
// Only `durationIsUnknown` days are excluded — the same pair rule, not the
// source alone.
//
// PRODUCTION (measured before implementing): of 91 students in the window, 8
// were behaviour-eligible and 4 of those relied on unmeasured days. Those 4
// move back to trusting their stated hours.

describe('the engine already ignores unmeasured hours in the magnitude', () => {
  it('a zero-hour day never enters typicalStudyHours', () => {
    const withZeros = computeCapacity([4, 0, 0, 4, 4, 0], 6, 6);
    const without = computeCapacity([4, 4, 4], 6, 6);
    expect(withZeros.typicalStudyHours).toBe(without.typicalStudyHours);
  });
});

describe('loggedDays is the evidence count, and unmeasured days are not evidence', () => {
  it('below the threshold, the student\'s own stated hours are trusted', () => {
    const c = computeCapacity([4, 4], 4, 6);
    expect(c.trust).toBe('input');
    expect(c.sustainableHours).toBe(6);
  });

  it('at the threshold, behaviour overrides the claim', () => {
    const c = computeCapacity([2, 2, 2, 2, 2], 5, 6);
    expect(c.trust).toBe('behaviour');
    expect(c.sustainableHours).toBe(2);
  });

  it('THE FIX: five days of which two were never measured is only three days of evidence', () => {
    // Same hours, different day count — this is the whole change, expressed at
    // the engine's own interface. The callers stop counting unmeasured days.
    const countingUnmeasured = computeCapacity([2, 2, 2], 5, 6);
    const pairAware = computeCapacity([2, 2, 2], 3, 6);
    expect(countingUnmeasured.trust, 'today: judged on 5 "days", 2 of them unmeasured').toBe('behaviour');
    expect(pairAware.trust, 'after: not enough measured evidence to override the claim').toBe('input');
    expect(pairAware.sustainableHours).toBe(6);
  });

  it('a real zero still counts as evidence — it is behaviour, not absence', () => {
    // 'didn't study' and 'rest' are complete answers (Q2). Excluding them would
    // let a student avoid the behaviour tier by honestly reporting bad days.
    const c = computeCapacity([2, 2, 2, 0, 0], 5, 6);
    expect(c.trust).toBe('behaviour');
  });
});

describe('the three callers count measured days only', () => {
  const code = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

  const SITES = [
    'src/lib/student-360.ts',
    'src/lib/lis-health.ts',
    'src/app/api/routine/today/route.ts',
  ];

  for (const p of SITES) {
    it(`${p} passes a measured-day count`, () => {
      const s = code(p);
      expect(s, 'must use the shared authority, not re-spell the pair rule')
        .toContain('durationIsUnknown');
      expect(s, 'and must select the column that authority needs')
        .toContain('study_duration_source');
      expect(s, 'the raw all-reports count must be gone from the capacity call')
        .not.toMatch(/computeCapacity\((?:hrs|recentStudyHours), (?:winReports|rep|recentStudyHours)\.length/);
    });
  }
});

describe('scope containment — Q4 changes the day COUNT and nothing else', () => {
  const engine = readFileSync(join(process.cwd(), 'src/lib/capacity-engine.ts'), 'utf8');

  it('the engine itself is untouched', () => {
    expect(engine).toContain('const MIN_DAYS_FOR_BEHAVIOUR = 5;');
    expect(engine).toContain('recentStudyHours.filter((h) => h > 0)');
    expect(engine).toContain('claimedHours != null ? round2(Math.min(claimedHours, behaviour))');
  });

  it('capBudget is still not wired into plan sizing', () => {
    // Founder: do NOT connect it. The audit established it has zero callers.
    const hits = ['src/app/api/routine/today/route.ts', 'src/lib/plan-day.ts']
      .filter((p) => { try { return readFileSync(join(process.cwd(), p), 'utf8').includes('capBudget'); } catch { return false; } });
    expect(hits, 'capBudget must remain uncalled').toEqual([]);
  });
});
