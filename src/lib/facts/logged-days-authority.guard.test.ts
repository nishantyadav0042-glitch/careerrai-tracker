import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FACTS } from './registry';

// ── 0C.3 Wave 1 — the canonical-source bypass guard ─────────────────────────
//
// Founder, 23 Aug: "Once a fact has a producer, consumers must not directly
// query its underlying source for that fact… Otherwise you'll eventually end
// up with a canonical producer + 17 'just this one small query' exceptions,
// and six months later you're back where you started."
//
// ── WHAT THIS GUARD PINS, AND WHY THAT SHAPE ───────────────────────────────
//
// It pins the CLAIM, not the arithmetic.
//
// The tempting guard is "no `- 7 * 86_400_000` near a `report_date` filter".
// That guard would have been useless: the six duplicate producers spelled the
// same window five different ways (`setDate(getDate()-7)`, `now.getTime() -
// 7*86_400_000`, `new Date(Date.now() - 7*86_400_000)`, a `cutoff` rebuilt
// inside a filter callback…), and a seventh would have found a sixth spelling.
// This repo has now shipped five guards that pinned characters instead of
// ideas and had to be re-cut; that mistake is not being made again here.
//
// So the rule is about the SENTENCE. If a file tells a human "N of 7 days",
// it is making the logged-days claim, and it must get N from the authority.
// The claim is what can be wrong in front of a student; the expression that
// produced it is an implementation detail.
//
// This is not theory. buddy-briefing.ts was the SEVENTH producer of this fact
// and the first 0C.3 audit pass missed it entirely — reading files by hand
// found six. Writing this guard found the seventh, before it shipped.

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/** The only module allowed to read daily_reports FOR THESE FACTS. */
const AUTHORITY = 'src/lib/reads/daily-log.ts';
/** The pure producers. A file importing either of these is consuming, not duplicating. */
const PRODUCERS = ['@/lib/facts/daily-log', './facts/daily-log', './daily-log'];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC).map((f) => ({
  path: f.slice(ROOT.length + 1).replace(/\\/g, '/'),
  body: readFileSync(f, 'utf8'),
}));

/** Strip comments, so a file EXPLAINING the old bug is not accused of it. */
function code(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// ── The claims that mean "logged days out of seven" ─────────────────────────
//
// Written as separate patterns rather than one clever regex so a failure names
// which sentence tripped it.
const SEVEN_DAY_CLAIM = [
  /\$\{[^}]*\}\s*\/\s*7\s*days?\s+logged/i,   // "${n}/7 days logged"
  /\$\{[^}]*\}\s*of\s+7\s*days/i,             // "${n} of 7 days"
  /Logged\s+\$\{[^}]*\}\s*\/\s*7/i,           // "Logged ${n}/7"
];

// Files that legitimately render an N/7 sentence about something that is NOT
// the logged-days fact. Each needs a stated reason; the list growing is a
// visible, reviewable event rather than a silent one.
const NOT_THIS_FACT: Record<string, string> = {
  'src/lib/lead-intel.ts':
    'renders TICKED days (routine_task_completions via prep-memory), a different ' +
    'canonical question per facts/canonical.ts. Renamed from loggedDaysLast7 in Wave 1 ' +
    'precisely so the two stop sharing a name.',
  'src/app/api/logging/log-daily/route.ts':
    'studyDaysIn7 counts DAY OUTCOMES over the 7 most recent ROWS (recent.slice(0,7)), ' +
    'not days in a calendar window, and filters on dayWasStudied (A3) rather than on ' +
    'having logged. Different fact, deferred with study_duration to Wave 5. Its "/7" ' +
    'meaning rows rather than days is recorded as an open honesty question, not fixed here.',
};

describe('the logged-days claim comes from the authority', () => {
  const claimants = FILES.filter((f) =>
    SEVEN_DAY_CLAIM.some((re) => re.test(code(f.body))));

  it('finds the surfaces that make the claim (the guard is still a guard)', () => {
    // If this drops to zero the patterns have rotted and every case below
    // passes vacuously — the failure mode of every string-matching guard.
    expect(claimants.length).toBeGreaterThan(3);
  });

  it('every claimant either consumes the producer or is declared a different fact', () => {
    const offenders = claimants
      .filter((f) => !(f.path in NOT_THIS_FACT))
      .filter((f) => !PRODUCERS.some((p) => f.body.includes(p)))
      .filter((f) => !f.body.includes('reads/daily-log'))
      .map((f) => f.path);

    expect(
      offenders,
      `These files tell a human "N of 7 days" from a number they computed themselves.\n` +
      `Either read it from ${AUTHORITY}, or add an entry to NOT_THIS_FACT saying which\n` +
      `other fact it is and why. Do NOT widen the regexes to make this pass.\n` +
      offenders.join('\n'),
    ).toEqual([]);
  });
});

describe('no second seven-day window over daily_reports', () => {
  it('only the authority filters report_date by a seven-day boundary', () => {
    // Narrower than the claim check on purpose: this catches a file that
    // computes the fact but has not yet rendered a sentence about it.
    //
    // PRECISION MATTERS HERE, and the first draft of this check got it wrong.
    // It asked "does this file contain a 7-day expression AND a report_date
    // filter?" and accused momentum.ts and urgency-score.ts, both of which
    // hold a `sevenDaysAgo` used for a DIFFERENT table while filtering
    // daily_reports on `fourteenDaysAgo`. Co-occurrence in a file is not use.
    //
    // So: resolve the identifier assigned from a 7-day expression, then check
    // whether THAT identifier is the argument to a report_date filter.
    const SEVEN_DAY_ASSIGN =
      /(?:const|let|var)\s+(\w+)[^;\n]*(?:-\s*7\s*\*\s*86_?400_?000|setDate\s*\([^)]*-\s*7\s*\))/g;
    // Also the two-line form: `const x = new Date(); x.setDate(x.getDate() - 7);`
    const SEVEN_DAY_MUTATE = /(\w+)\.setDate\(\s*\1\.getDate\(\)\s*-\s*7\s*\)/g;

    const offenders: string[] = [];
    for (const f of FILES) {
      if (f.path === AUTHORITY) continue;
      const c = code(f.body);
      const names = new Set<string>();
      for (const m of c.matchAll(SEVEN_DAY_ASSIGN)) names.add(m[1]);
      for (const m of c.matchAll(SEVEN_DAY_MUTATE)) names.add(m[1]);
      if (names.size === 0) continue;

      // Every argument passed to a report_date range filter in this file.
      const args = [...c.matchAll(/\.(?:gte|lte)\(\s*['"]report_date['"]\s*,\s*([^)]*)\)/g)]
        .map((m) => m[1]);
      for (const name of names) {
        if (args.some((a) => new RegExp(`\\b${name}\\b`).test(a))) {
          offenders.push(`${f.path} (${name})`);
          break;
        }
      }
    }

    expect(
      offenders,
      `A seven-day daily_reports window outside ${AUTHORITY}.\n` +
      `Every one of these before Wave 1 was an EIGHT-day window ("today − 7" then\n` +
      `.gte, inclusive) and several rendered it as "/7".\n` + offenders.join('\n'),
    ).toEqual([]);
  });

  it('still detects the pattern it was written for (not vacuous)', () => {
    // The precision fix above could easily have made this check match nothing
    // at all. Prove the resolver still fires on the exact shape that shipped
    // five times, using a synthetic body rather than a real file.
    const planted = `
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      admin.from('daily_reports').select('report_date').gte('report_date', sevenDaysAgo);
    `;
    const names = [...planted.matchAll(
      /(?:const|let|var)\s+(\w+)[^;\n]*(?:-\s*7\s*\*\s*86_?400_?000|setDate\s*\([^)]*-\s*7\s*\))/g,
    )].map((m) => m[1]);
    expect(names).toContain('sevenDaysAgo');
    const args = [...planted.matchAll(/\.(?:gte|lte)\(\s*['"]report_date['"]\s*,\s*([^)]*)\)/g)]
      .map((m) => m[1]);
    expect(args.some((a) => a.includes('sevenDaysAgo'))).toBe(true);
  });
});

describe('the registry stays single-authority', () => {
  it('each registered key is defined exactly once', () => {
    for (const [key, def] of Object.entries(FACTS)) {
      expect(def.key, `FACTS['${key}'] is keyed by a different name than it declares`).toBe(key);
    }
    const keys = Object.values(FACTS).map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Registered, but nothing consumes it yet. A fact with no consumer is
  // speculative inventory (0C.2.1's own rule), so this list is debt, not a
  // category — every entry must name the wave that will retire it.
  //
  // FOUND BY THIS GUARD, not by review: observed_day_outcome shipped in 0C.2.2
  // (19 Aug) as the registry's first and only fact and has never been read by
  // anything. It is recorded here rather than quietly tolerated, and rather
  // than the check being softened to hide it.
  const KNOWN_DEAD: Record<string, string> = {
    observed_day_outcome:
      'Shipped 0C.2.2, never consumed. Its consumer is the day-outcome surface, ' +
      'which belongs to the plan/completion wave — deferred, semantics still open. ' +
      'Retire this entry when that wave lands, or delete the fact.',
  };

  it('the dead-authority list is not silently growing', () => {
    expect(Object.keys(KNOWN_DEAD)).toEqual(['observed_day_outcome']);
  });

  it('every registered fact has at least one consumer — no dead authority', () => {
    for (const def of Object.values(FACTS)) {
      if (def.key in KNOWN_DEAD) continue;
      const importers = FILES.filter(
        (f) => !f.path.startsWith('src/lib/facts/') && !f.path.startsWith('src/lib/reads/')
      ).filter((f) => new RegExp(`\\b${def.key.replace(/_(.)/g, (_, c) => c.toUpperCase())}\\b`).test(f.body));
      const readerUsers = FILES.filter((f) => f.body.includes('reads/daily-log'));
      expect(
        importers.length + (def.key.startsWith('logged_') ? readerUsers.length : 0),
        `${def.key} is registered but nothing consumes it`,
      ).toBeGreaterThan(0);
    }
  });

  it('the window authority is a leaf — importable from anywhere, including the browser', () => {
    const w = readFileSync(join(SRC, 'lib/facts/window.ts'), 'utf8');
    expect(/^\s*import\s/m.test(w), 'facts/window.ts must import nothing').toBe(false);
  });
});
