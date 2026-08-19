import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── G2 (J7+J8) and G3 (J12) ─────────────────────────────────────────────────
//
// G2 -- log-daily must never SHRINK topics_covered. complete-task has always
// merged; the RPC's UPDATE branch does an unconditional replace, so a student
// who ticked QA on the plan card and then submitted the log sheet with only
// VARC lost the QA record. The union happens in application code -- no
// migration, no change to the stored procedure.
//
// G3 -- a coverage advance is a derived write on top of a tick that already
// succeeded. Both failure branches were console.error'd and discarded, so the
// route could not tell the caller anything went wrong: the tick was saved, the
// Coverage Matrix silently was not, and tomorrow's Topic Selector read stale
// state. Surfaced the same way dayClosed already surfaces the RPC's failure.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const LOG_DAILY = 'src/app/api/logging/log-daily/route.ts';
const COMPLETE = 'src/app/api/routine/complete-task/route.ts';

describe('G2 — a section already recorded is never lost', () => {
  it('log-daily unions rather than replaces', () => {
    const s = read(LOG_DAILY);
    expect(s, 'the RPC must receive the merged set').toMatch(/p_topics_covered:\s*mergedSections/);
    expect(s, 'the merge must be a set union of existing and incoming')
      .toMatch(/mergedSections = \[\.\.\.new Set\(\[[\s\S]{0,200}topics_covered[\s\S]{0,120}body\.sections/);
  });

  it('it reuses the existing fetch rather than adding a query', () => {
    const s = read(LOG_DAILY);
    expect(s, 'topics_covered must come from the existingLog select')
      .toMatch(/\.select\('id, updated_at, topics_covered'\)/);
  });

  it('no migration and no stored-procedure change', () => {
    const s = read(LOG_DAILY);
    expect(s).not.toMatch(/CREATE OR REPLACE FUNCTION/i);
    expect(s).not.toMatch(/ALTER TABLE/i);
  });
});

describe('G3 — a failed coverage advance reaches the caller', () => {
  it('both failure branches set the flag', () => {
    const s = read(COMPLETE);
    const read_fail = /coverage read failed[\s\S]{0,160}coverageAdvanceFailed = true/;
    const upsert_fail = /coverage upsert failed[\s\S]{0,160}coverageAdvanceFailed = true/;
    expect(s, 'a failed read must be reported').toMatch(read_fail);
    expect(s, 'a failed upsert must be reported').toMatch(upsert_fail);
  });

  it('the flag is in the response, beside dayClosed', () => {
    const s = read(COMPLETE);
    expect(s).toMatch(/dayClosed,[\s\S]{0,300}coverageAdvanceFailed,/);
  });

  it('it does not pretend the advance succeeded', () => {
    // The whole point: the tick IS saved, so the route must not claim failure
    // of the tick, and must not claim success of the advance.
    const s = read(COMPLETE);
    expect(s).toMatch(/let coverageAdvanceFailed = false;/);
    expect(s, 'the default must be "did not fail", flipped only on real errors')
      .not.toMatch(/coverageAdvanceFailed = true;\s*\n\s*\}\s*else\s*\{\s*\n\s*coverageAdvanceFailed = false/);
  });

  it('the tick itself is still saved before any of this', () => {
    const s = read(COMPLETE);
    const insert = s.indexOf("from('routine_task_completions')");
    const advance = s.indexOf('coverageAdvanceFailed = true');
    expect(insert).toBeGreaterThan(-1);
    expect(advance, 'the advance is downstream of the tick').toBeGreaterThan(insert);
  });
});
