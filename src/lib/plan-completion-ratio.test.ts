import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { completionWeight, PARTIAL_WEIGHT, FULL_WEIGHT } from './completion-portion';
import { computeAdaptation } from './adaptation-engine';

// ── P0-2.3b — PARTIAL IS 0.5, AND ONLY HERE ─────────────────────────────────
//
// Founder ruling G3, 18 Aug: "PARTIAL contributes 0.5 ONLY to the
// plan-completion ratio. Do not propagate 0.5 into coverage, touched-task
// counts, streaks, day closure, emergency minimums, or other whole-task
// metrics."
//
// WHY THIS RATIO AND NOTHING ELSE: `completionRatio` is a LOAD proxy. It drives
// "your days are running heavy", the 'speed' constraint push, and the coaching
// decision. Load is the one question where half-finishing is genuinely half. A
// student who half-finishes every task is not running a balanced day, and
// counting those as whole tasks tells them their load is fine.
//
// Every other metric asks a binary question — was it finished? was it touched?
// — and a half belongs wholly on one side of each. Spreading 0.5 into a count
// of whole tasks would invent a third unit.
//
// THE SHAPE OF THE CODE, traced not assumed: there is ONE formula
// (adaptation-engine.ts:70) fed by THREE separate accumulators — Home
// (routine/today buildHistory), the founder dashboard (lis-health) and admin
// (student-360). All three summed `done.size`, a count of completion ROWS that
// never read `confidence`.

describe('the weight itself', () => {
  it('FULL is 1, PARTIAL is 0.5', () => {
    expect(FULL_WEIGHT).toBe(1);
    expect(PARTIAL_WEIGHT).toBe(0.5);
    expect(completionWeight('green')).toBe(1);
    expect(completionWeight('blue')).toBe(0.5);
  });

  it('a null-confidence completion weighs a full task', () => {
    // Two provenances, one meaning: no partiality was ever expressed.
    expect(completionWeight(null)).toBe(1);
    expect(completionWeight(undefined)).toBe(1);
  });

  it('struggle signals weigh a full task — they mark a finished, hard one', () => {
    expect(completionWeight('yellow')).toBe(1);
    expect(completionWeight('red')).toBe(1);
  });

  it('an unrecognised signal fails closed to a full task', () => {
    for (const c of ['', 'BLUE', 'half', 'partial']) {
      expect(completionWeight(c), c).toBe(1);
    }
  });
});

describe('the ratio, end to end', () => {
  const ratio = (done: number, planned: number, days = 5) =>
    computeAdaptation([], done, planned, days).completionRatio;

  it('all FULL is 100%', () => {
    expect(ratio(10, 10)).toBe(1);
  });

  it('all untouched is 0%', () => {
    expect(ratio(0, 10)).toBe(0);
  });

  it('all PARTIAL is 50%, not 100%', () => {
    // Four tasks a day, five days, every one half-finished.
    expect(ratio(20 * PARTIAL_WEIGHT, 20)).toBe(0.5);
  });

  it('one PARTIAL among nine FULL is 95%', () => {
    expect(ratio(9 * FULL_WEIGHT + 1 * PARTIAL_WEIGHT, 10)).toBe(0.95);
  });

  it('mixed FULL / PARTIAL / untouched lands between them', () => {
    // 4 full, 2 half, 4 untouched of 10 = 5/10.
    expect(ratio(4 + 2 * PARTIAL_WEIGHT, 10)).toBe(0.5);
  });

  it('is null when there is no plan to price', () => {
    expect(ratio(0, 0)).toBeNull();
    expect(computeAdaptation([], 5, 10, 0).completionRatio).toBeNull();
  });
});

describe('all three accumulators weigh, and they read the column they need', () => {
  const files = {
    home: 'src/app/api/routine/today/route.ts',
    founder: 'src/lib/lis-health.ts',
    admin: 'src/lib/student-360.ts',
  };

  for (const [name, path] of Object.entries(files)) {
    it(`${name} weighs its completions`, () => {
      const src = readFileSync(join(process.cwd(), path), 'utf8');
      expect(src, `${path} must weigh, not count rows`).toContain('completionWeight');
      expect(src, `${path} cannot weigh without confidence`).toMatch(/select\([^)]*confidence/);
    });

    it(`${name} no longer sums a bare row count into the ratio`, () => {
      const src = readFileSync(join(process.cwd(), path), 'utf8');
      const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      expect(code, `${path}`).not.toMatch(/completedTasks \+= Math\.min\([^,]+, \w+\.size\)/);
    });
  }
});

describe('0.5 is CONFINED to the plan-completion ratio', () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(e) && !e.includes('.test.')) out.push(p);
    }
    return out;
  };

  it('exactly the three ratio accumulators import the weight', () => {
    const importers = walk(join(process.cwd(), 'src'))
      .filter((f) => /completionWeight/.test(readFileSync(f, 'utf8')))
      .filter((f) => !f.endsWith('completion-portion.ts'))
      .map((f) => f.replace(`${process.cwd()}/`, ''))
      .sort();
    expect(importers).toEqual([
      'src/app/api/routine/today/route.ts',
      'src/lib/lis-health.ts',
      'src/lib/student-360.ts',
    ]);
  });

  it('day closure still asks a whole-task question', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/routine/complete-task/route.ts'), 'utf8');
    expect(route).toContain('countsAsFullyDone');
    expect(route, 'the ratio weight must not leak into day closure').not.toContain('completionWeight');
  });

  it('the coverage ladder is untouched by the weight', () => {
    const cov = readFileSync(join(process.cwd(), 'src/lib/coverage-status.ts'), 'utf8');
    expect(cov).not.toContain('completionWeight');
    expect(cov).not.toContain('0.5');
  });

  it('the Fact Registry never sees it', () => {
    for (const f of ['registry.ts', 'contract.ts', 'canonical.ts']) {
      const src = readFileSync(join(process.cwd(), 'src/lib/facts', f), 'utf8');
      expect(src, f).not.toContain('completionWeight');
    }
  });

  it('hours keep their own, separate 0.5', () => {
    // creditedHours has priced a half at 0.5 since it shipped. That is a
    // different question (effort) reaching the same number by its own route,
    // and it is deliberately NOT unified — one is hours, one is a task count.
    const credit = readFileSync(join(process.cwd(), 'src/lib/study-credit.ts'), 'utf8');
    expect(credit).toContain('0.5');
    expect(credit).not.toContain('completionWeight');
  });

  it('weekly-diagnosis still asks "was this section touched at all?"', () => {
    // planned >= 2 && completed === 0 is a TOUCHED question, not a ratio. A
    // partial counts wholly there, per the contract. Left unchanged on purpose.
    const wd = readFileSync(join(process.cwd(), 'src/lib/weekly-diagnosis.ts'), 'utf8');
    expect(wd).not.toContain('completionWeight');
    expect(wd).toContain('skippedSections');
  });
});
