import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── The 0.5 weighting lives in the ratio, and only in the ratio ─────────────
//
// Three call sites compute "how much of the plan got finished" and hand it to
// computeAdaptation: /api/routine/today, lis-health and student-360. All three
// counted DATABASE ROWS, so a half-tick counted as a whole finished task and a
// student who got halfway through everything read as 100%.
//
// That ratio is not cosmetic: it feeds the founder-facing "finishes ~X% of the
// plan", and HEAVY_COMPLETION_RATIO, which decides whether a student's plan is
// adapted as too heavy.
//
// The scope is deliberately narrow. A half-tick is still a TOUCHED task
// everywhere else -- yesterday's done-count, the unfinished-topic list, section
// recency. Those ask "was this touched", not "how much got finished", and
// weighting them would be a second, wrong opinion.
//
// So this guards two things at once: every ratio site uses the one authority,
// and no other site starts applying the weight.

const ROOT = process.cwd();
const code = (p: string) =>
  readFileSync(join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const RATIO_SITES = [
  'src/app/api/routine/today/route.ts',
  'src/lib/lis-health.ts',
  'src/lib/student-360.ts',
];

describe('plan-completion ratio weighs a half-tick 0.5', () => {
  it('every ratio site uses the canonical authority', () => {
    for (const f of RATIO_SITES) {
      expect(code(f), `${f} must weigh completions, not count rows`).toMatch(/weightedCompletedForDay/);
    }
  });

  it('no ratio site still counts raw rows into completedTasks', () => {
    const offenders: string[] = [];
    for (const f of RATIO_SITES) {
      // the old shape: completedTasks += Math.min(<n>, <set>.size)
      if (/completedTasks\s*\+=\s*Math\.min\([^)]*\.size/.test(code(f))) offenders.push(f);
    }
    expect(offenders, 'a raw .size here is the defect returning').toEqual([]);
  });

  it('the weight is defined once, in completion-portion', () => {
    const authority = code('src/lib/completion-portion.ts');
    expect(authority).toMatch(/export function completionWeight/);
    expect(authority).toMatch(/export function weightedCompletedForDay/);
    // Nobody else may re-decide what a half-tick is worth. Checked by looking
    // for a SECOND mapping from the signal to a number -- not for the literal
    // 0.5, which appears legitimately elsewhere (adaptation-engine's
    // `tooLittleRatio >= 0.5` is a majority threshold on plan-fit taps and has
    // nothing to do with completions). A blunt 0.5 check flagged exactly that
    // and would have taught the next person to work around the test.
    const others = [...RATIO_SITES, 'src/lib/adaptation-engine.ts'];
    for (const f of others) {
      const src = code(f);
      expect(src, `${f} must not map the half-tick signal to a weight itself`)
        .not.toMatch(/HALF_TICK_SIGNAL[\s\S]{0,60}0\.5|0\.5[\s\S]{0,60}HALF_TICK_SIGNAL/);
      expect(src, `${f} must not re-implement portionOf`)
        .not.toMatch(/===\s*'blue'\s*\?/);
    }
  });

  it('adaptation still receives a ratio, not a raw count', () => {
    const engine = code('src/lib/adaptation-engine.ts');
    expect(engine).toMatch(/completedTasks\s*\/\s*plannedTasks/);
    expect(engine).toMatch(/HEAVY_COMPLETION_RATIO/);
  });

  it('touched-ness surfaces are NOT weighted', () => {
    // routine/today keeps a plain id set for yesterday's done-count and the
    // unfinished-topic list. If that ever becomes weighted, a student sees
    // "2.5 of 4 done", which is not a sentence.
    const today = code('src/app/api/routine/today/route.ts');
    expect(today, 'the student-facing done-count stays a whole number').toMatch(/completedByDate\s*=\s*new Map<string, Set<string>>/);
  });
});
