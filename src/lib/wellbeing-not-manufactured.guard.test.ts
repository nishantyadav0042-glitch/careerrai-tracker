import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── The log RPC may not overwrite what it was never told ────────────────────
//
// upsert_log_and_streak takes NO wellbeing parameters. Neither caller
// (log-daily, complete-task) sends any. Yet its UPDATE branch assigned six
// wellbeing columns hardcoded constants on every write:
//
//     quality_focus = 3, difficulty = 3, stress = 2,
//     sleep_quality = 3, overall_energy = 4, nutrition_exercise = FALSE
//
// So every time a student re-saved a day's log, six columns of their own
// reported wellbeing were replaced with numbers nobody had entered. 34 rows
// still held a real value at the time this was found; each would have been
// destroyed the next time that day was touched.
//
// Present since 20260614_constraints_audit_atomic.sql -- long-standing, not a
// regression from the provenance work, which carried it forward faithfully.
//
// This is the same rule the provenance CASE already encodes one column to its
// left: a writer that does not know a value must not destroy it. The stamp
// argument and the wellbeing argument are the same argument.
//
// DELIBERATELY NARROW. The INSERT branch still writes constants, and is NOT
// touched here: those columns are NOT NULL, so "unknown wellbeing" has no
// representation yet, and inventing one is a product decision rather than a
// bug fix. This test therefore guards the UPDATE path only -- the one that
// destroys data that already exists.

const ROOT = process.cwd();
const CLOBBERED = ['quality_focus', 'difficulty', 'stress', 'sleep_quality', 'overall_energy', 'nutrition_exercise'];

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
}

/** The body of the UPDATE public.daily_reports ... statement, comments removed. */
function updateBranches(sql: string): string[] {
  const clean = stripSqlComments(sql);
  return [...clean.matchAll(/update\s+public\.daily_reports\s+set([\s\S]*?)where/gi)].map((m) => m[1]);
}

const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();

/** The migration that currently defines the RPC is the LAST one that does. */
const definingMigration = migrations
  .filter((f) => readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8')
    .includes('FUNCTION public.upsert_log_and_streak'))
  .pop();

describe('upsert_log_and_streak does not manufacture wellbeing on update', () => {
  it('has a migration defining the RPC', () => {
    expect(definingMigration, 'no migration defines upsert_log_and_streak').toBeTruthy();
  });

  it('assigns no wellbeing column a constant in the UPDATE branch', () => {
    const sql = readFileSync(join(ROOT, 'supabase/migrations', definingMigration!), 'utf8');
    const offenders: string[] = [];
    for (const body of updateBranches(sql)) {
      for (const col of CLOBBERED) {
        if (new RegExp(`\\b${col}\\s*=`, 'i').test(body)) offenders.push(col);
      }
    }
    expect(offenders, 'the RPC has no wellbeing input, so it must not write wellbeing').toEqual([]);
  });

  it('still writes the fields it IS given', () => {
    // Guard against "fixing" this by gutting the UPDATE entirely.
    const sql = readFileSync(join(ROOT, 'supabase/migrations', definingMigration!), 'utf8');
    const body = updateBranches(sql).join('\n');
    for (const col of ['study_duration', 'topics_covered', 'mood_emoji', 'mock_taken', 'notes', 'emotional_chips']) {
      expect(body, `${col} is a real parameter and must still be written`).toMatch(new RegExp(`\\b${col}\\s*=`, 'i'));
    }
  });

  it('keeps the provenance rule intact', () => {
    const sql = stripSqlComments(readFileSync(join(ROOT, 'supabase/migrations', definingMigration!), 'utf8'));
    expect(sql).toMatch(/study_duration_source\s*=\s*CASE/i);
    expect(sql).toMatch(/IS DISTINCT FROM/i);
  });
});
