import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  sourceForMergedDuration,
  sourceForLoggedDuration,
  isStudyDurationSource,
  STUDY_DURATION_SOURCES,
} from './study-duration-source';

// ── G13-A1 + G13-A2: provenance that survives the next write ────────────────
//
// G13 proved study_duration_source could not function as provenance:
//   · the RPC's UPDATE branch wrote it unconditionally, so any stamp was
//     erased by the student's next edit or the next routine tick;
//   · neither live caller supplied it, so the 9th arg always defaulted NULL;
//   · 342 of 342 production rows were NULL, including 32 written AFTER the
//     column shipped.
//
// THE TRAP THIS FILE HOLDS SHUT. COALESCE alone is not the fix and is worse
// than nothing once stamps exist: the RPC overwrites study_duration
// unconditionally, so preserving an old 'credited' stamp against a NEW value
// asserts that value was priced from coverage when it was not. That is the
// false-provenance claim J6-A forbids by name. The stamp must describe the
// value that actually SURVIVED — which is why the caller must compute it and
// COALESCE is only the safety net for a caller that genuinely does not know.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MIGRATION = 'supabase/migrations/20260819b_provenance_survives_the_next_write.sql';
const LOG_DAILY = 'src/app/api/logging/log-daily/route.ts';
const COMPLETE = 'src/app/api/routine/complete-task/route.ts';

describe('the RPC stops destroying what it does not know', () => {
  const sql = () => read(MIGRATION);

  it('preserves an existing source when the caller passes none', () => {
    expect(sql(), 'the UPDATE branch must COALESCE, not overwrite')
      .toMatch(/study_duration_source\s*=\s*COALESCE\s*\(\s*p_study_duration_source\s*,\s*study_duration_source\s*\)/i);
  });

  it('stops resetting confidence on every update', () => {
    // log-daily captures the student's real confidence in a follow-up UPDATE.
    // The RPC then reset it to 4 on any later write, so a routine tick erased
    // an answer the student had already given: 312 of 342 production rows
    // carry the manufactured 4. The INSERT default is out of scope here — it
    // manufactures nothing that existed before it.
    const update = sql().slice(sql().indexOf('ELSE'), sql().indexOf('END IF;'));
    expect(update, 'the UPDATE branch must not assign confidence')
      .not.toMatch(/confidence\s*=/);
  });

  it('rewrites no historical row', () => {
    // J6-A: no backfill, ever. Existing NULLs stay NULL and mean "unknown".
    // Assert on STATEMENTS, not on the word. This guard reads the file as
    // text and cannot tell a comment from SQL, and the migration necessarily
    // explains what NULL must not be read as — keying on the bare label would
    // fail forever the moment the reasoning is written down. Third time this
    // pattern has bitten; assert the thing that is actually forbidden.
    const statements = sql()
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(statements, 'no data migration may touch stored evidence')
      .not.toMatch(/UPDATE\s+public\.daily_reports\s+SET\s+study_duration_source/i);
    expect(statements, 'no literal source value may be written into existing rows')
      .not.toMatch(/SET[^;]*study_duration_source\s*=\s*'/i);
  });

  it('restores the ACL it replaces', () => {
    expect(sql()).toMatch(/REVOKE ALL ON FUNCTION public\.upsert_log_and_streak[\s\S]*FROM public, anon, authenticated/);
    expect(sql()).toMatch(/GRANT EXECUTE ON FUNCTION public\.upsert_log_and_streak[\s\S]*TO service_role/);
  });

  it('keeps the 9-arg signature — no new overload', () => {
    expect(sql(), 'CREATE OR REPLACE on the same signature, never a second overload')
      .toContain('CREATE OR REPLACE FUNCTION public.upsert_log_and_streak');
    expect(sql()).not.toMatch(/DROP FUNCTION/);
  });
});

describe('both callers now state the provenance of what they write', () => {
  it('log-daily passes the argument', () => {
    expect(read(LOG_DAILY)).toContain('p_study_duration_source');
  });

  it('complete-task passes the argument', () => {
    expect(read(COMPLETE)).toContain('p_study_duration_source');
  });

  it('complete-task reads the existing source before merging', () => {
    // Without this the merge cannot know what the surviving value meant, and
    // sourceForMergedDuration has no input at the only site that credits.
    const s = read(COMPLETE);
    const from = s.indexOf("from('daily_reports')");
    expect(from, 'the existing-log query must still exist').toBeGreaterThan(-1);
    const sel = s.slice(from, s.indexOf('maybeSingle()', from));
    expect(sel, 'the existing-log query must select the provenance column')
      .toContain('study_duration_source');
  });
});

describe('stamp the winner, never the write that ran', () => {
  it('credit that loses the merge does not claim the surviving value', () => {
    // The case that makes COALESCE alone unsafe.
    expect(sourceForMergedDuration({ earned: 2, existing: 4, existingSource: 'self_reported' }))
      .toBe('self_reported');
  });

  it('credit that wins the merge is credited', () => {
    expect(sourceForMergedDuration({ earned: 5, existing: 4, existingSource: 'self_reported' }))
      .toBe('credited');
  });

  it('a tie preserves the existing meaning — the number did not change', () => {
    expect(sourceForMergedDuration({ earned: 4, existing: 4, existingSource: 'declared_zero' }))
      .toBe('declared_zero');
  });

  it('a legacy NULL survives as NULL — an unknown is never upgraded to a guess', () => {
    expect(sourceForMergedDuration({ earned: 1, existing: 3, existingSource: null })).toBeNull();
  });

  it('a first write with nothing to merge against is credited', () => {
    expect(sourceForMergedDuration({ earned: 2, existing: null, existingSource: null }))
      .toBe('credited');
  });

  it('declared zero loses to any credit', () => {
    expect(sourceForMergedDuration({ earned: 1.5, existing: 0, existingSource: 'declared_zero' }))
      .toBe('credited');
  });
});

describe('the log sheet stamps only what the server can establish', () => {
  // The sheet does NOT collect self-reported hours — it posts
  // creditedHours(...) (LoggingModal:187). So the server cannot establish
  // where a positive number came from, and says so by leaving it NULL rather
  // than asserting 'credited' for a value it did not compute.
  it('a declared rest day is declared_zero', () => {
    expect(sourceForLoggedDuration({ hours: 0, dayOutcome: 'not_studied' })).toBe('declared_zero');
    expect(sourceForLoggedDuration({ hours: 0, dayOutcome: 'skipped' })).toBe('declared_zero');
  });

  it('work with no duration is not_collected — the question was never finished', () => {
    expect(sourceForLoggedDuration({ hours: 0, dayOutcome: 'studied' })).toBe('not_collected');
    expect(sourceForLoggedDuration({ hours: 0, dayOutcome: 'partial' })).toBe('not_collected');
  });

  it('zero with no outcome at all is not_collected, never declared_zero', () => {
    expect(sourceForLoggedDuration({ hours: 0, dayOutcome: null })).toBe('not_collected');
    expect(sourceForLoggedDuration({ hours: 0, dayOutcome: 'nonsense' })).toBe('not_collected');
  });

  it('a positive duration the server did not compute stays UNKNOWN', () => {
    expect(sourceForLoggedDuration({ hours: 3.5, dayOutcome: 'studied' })).toBeNull();
    expect(sourceForLoggedDuration({ hours: 0.5, dayOutcome: null })).toBeNull();
  });
});

describe('the vocabulary is closed and NULL is not part of it', () => {
  it('exactly four labels', () => {
    expect([...STUDY_DURATION_SOURCES].sort())
      .toEqual(['credited', 'declared_zero', 'not_collected', 'self_reported']);
  });

  it('NULL is unknown, not a fifth label', () => {
    expect(isStudyDurationSource(null)).toBe(false);
    expect(isStudyDurationSource('unknown')).toBe(false);
  });
});
