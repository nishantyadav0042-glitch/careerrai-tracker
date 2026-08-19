import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HALF_TICK_SIGNAL } from './completion-portion';

// ── The half-tick writes a value the database has always rejected ───────────
//
// Found during G10A (19 Aug) while checking whether completions could join the
// log transaction.
//
//   20260706_add_confidence_to_task_completions.sql:
//     CHECK (confidence IS NULL OR confidence IN ('green', 'yellow', 'red'))
//
//   completion-portion.ts (18 Aug, P0-2.1):
//     HALF_TICK_SIGNAL = 'blue'
//
// The constraint predates the half-tick by six weeks. Every half-tick insert
// violates it (23514), the route returns 500, and the integrated flow's
// `.catch(() => {})` discards it — so the student's "Got halfway" is recorded
// nowhere while their credited hours still count it as half a task.
//
// PRODUCTION CONFIRMATION: 269 completion rows exist — 238 green, 29 legacy
// null, 2 red. ZERO 'blue', ever. The value has never once been stored.
//
// WHY THIS BLOCKS THE A1 TRANSACTION WORK, and why it is fixed first: under a
// single log+completions transaction a rejected half-tick would ROLL BACK THE
// WHOLE LOG. That converts a silent loss of one completion into total loss of
// the student's day. The landmine has to be cleared before the transaction is
// built on top of it.
//
// SCOPE: widen the vocabulary the column accepts to match the vocabulary the
// application already writes. No value is rewritten, no row is touched, and
// the portion semantics ruled in P0-2 are unchanged.

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const sqlFiles = () => readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));

describe('the signal the app writes and the values the column accepts are one set', () => {
  it('HALF_TICK_SIGNAL is blue — the value P0-2 chose', () => {
    expect(HALF_TICK_SIGNAL).toBe('blue');
  });

  it('a migration admits blue to the confidence CHECK', () => {
    const admits = sqlFiles().some((f) => {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8').toLowerCase();
      return sql.includes('confidence') && sql.includes("'blue'") && sql.includes('check');
    });
    expect(admits, 'no migration lets the column store a half-tick').toBe(true);
  });

  it('the original narrow constraint is explicitly replaced, not left beside a new one', () => {
    // Two CHECKs on one column both apply — adding a permissive one next to the
    // restrictive one would change nothing at all.
    const fix = sqlFiles()
      .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
      .find((s) => s.toLowerCase().includes("'blue'") && s.toLowerCase().includes('confidence'));
    expect(fix).toBeTruthy();
    expect((fix as string).toLowerCase(), 'the old constraint must be dropped')
      .toMatch(/drop constraint/);
  });

  it('the fix widens the vocabulary and rewrites no data', () => {
    const fix = sqlFiles()
      .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
      .find((s) => s.toLowerCase().includes("'blue'") && s.toLowerCase().includes('confidence')) as string;
    const body = fix.replace(/--[^\n]*/g, '');
    expect(body, 'no historical row may be altered').not.toMatch(/\bupdate\s+(public\.)?routine_task_completions\b/i);
    expect(body).not.toMatch(/\bdelete\s+from\b/i);
    // Every value the app can legitimately produce must survive the rewrite.
    for (const v of ['green', 'yellow', 'red', 'blue']) expect(body).toContain(`'${v}'`);
  });

  it('P0-2 portion semantics are untouched — this is a storage fix, not a rules change', () => {
    const cp = readFileSync(join(process.cwd(), 'src/lib/completion-portion.ts'), 'utf8');
    expect(cp).toContain("export const HALF_TICK_SIGNAL = 'blue'");
    expect(cp, 'the half-is-not-done rule stays exactly as ruled').toMatch(/countsAsFullyDone/);
  });
});
