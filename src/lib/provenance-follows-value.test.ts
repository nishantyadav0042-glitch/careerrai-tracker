import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { durationIsUnknown } from './check-in';

// ── Q5 gate: provenance follows the VALUE, and the handoff opens TODAY ──────
//
// TWO live production defects, both from the interaction of today's own gates.
//
// (1) A real student finished the Q5 handoff at 3.0 hours and their row read
//     study_duration 3.0 / study_duration_source 'not_collected'. Three
//     measured hours labelled unmeasured, which Q3 then discarded. The
//     check-in gate stamps not_collected at 0 hours (correct);
//     sourceForLoggedDuration returns NULL for a positive client-computed
//     number (correct -- the server cannot establish its origin); and COALESCE
//     preserved the stale stamp (wrong).
//
// (2) completion_write never fired for a handoff, because the fan-out is
//     guarded by !backdated and the handoff backdated. The guard is CORRECT --
//     complete-task resolves the routine by its own getLogDateString(), so a
//     backdated log would have written YESTERDAY's ticks as TODAY's
//     completions. The defect was upstream: LoggingModal always fetches
//     /api/routine/today, so the student saw today's plan while logging
//     yesterday.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MIGRATION = 'supabase/migrations/20260819e_provenance_follows_the_value.sql';
const GATE = 'src/components/check-in-gate.tsx';
const APP = 'src/components/DailyTracker/DailyTrackerApp.tsx';
const sqlStatements = () =>
  read(MIGRATION).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('the transition rule', () => {
  it('preserves the stamp when the value is unchanged', () => {
    // A caller that does not know must not destroy a stamp FOR THE SAME VALUE.
    expect(sqlStatements()).toMatch(
      /ELSE COALESCE\(p_study_duration_source, study_duration_source\)/,
    );
  });

  it('drops the stamp when the value changes', () => {
    expect(sqlStatements()).toMatch(
      /WHEN p_study_duration IS DISTINCT FROM study_duration\s*\n\s*THEN p_study_duration_source/,
    );
  });

  it('introduces no new vocabulary', () => {
    expect(sqlStatements(), "self_reported must NOT become a writer").not.toMatch(/self_reported/);
  });

  it('rewrites no historical row', () => {
    const s = sqlStatements();
    expect(s).not.toMatch(/UPDATE public\.daily_reports\s+SET\s+study_duration_source/i);
    expect(s).not.toMatch(/ALTER TABLE|CREATE TABLE|DROP TABLE/i);
  });

  it('keeps the ACL it replaces', () => {
    const s = sqlStatements();
    expect(s).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM public, anon, authenticated/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
  });
});

describe('what Q3 then believes — the point of the whole fix', () => {
  it('a measured day whose origin is unknown is MEASURED', () => {
    // 0/not_collected -> 3.0/NULL is the transition that was broken.
    expect(durationIsUnknown({ study_duration: 3, study_duration_source: null, day_outcome: 'partial' }))
      .toBe(false);
  });

  it('a still-uncollected day stays unknown', () => {
    expect(durationIsUnknown({ study_duration: 0, study_duration_source: 'not_collected' })).toBe(true);
  });

  it('a declared rest day stays a measured zero', () => {
    expect(durationIsUnknown({ study_duration: 0, study_duration_source: 'declared_zero', day_outcome: 'not_studied' }))
      .toBe(false);
  });

  it('credited stays credited and measured', () => {
    expect(durationIsUnknown({ study_duration: 2, study_duration_source: 'credited' })).toBe(false);
  });

  it('the contradictory state can no longer be produced', () => {
    // not_collected + positive duration was the falsehood. If it ever appears
    // again, Q3 would discard real hours -- so assert the reader still treats
    // it as unknown (it must, that is what not_collected means) and rely on the
    // migration to stop it being WRITTEN.
    expect(durationIsUnknown({ study_duration: 3, study_duration_source: 'not_collected' })).toBe(true);
  });
});

describe('the Q5 handoff opens TODAY', () => {
  it('the gate no longer sends a date', () => {
    const s = read(GATE);
    expect(s, 'a historical task surface cannot be safely represented')
      .not.toMatch(/cr-open-log-for-date/);
    expect(s).toMatch(/dispatchEvent\(new Event\('cr-open-log'\)\)/);
  });

  it('the sheet clears any backdate when it opens for the handoff', () => {
    const s = read(APP);
    expect(s).toMatch(/addEventListener\('cr-open-log', open\)/);
    expect(s).toMatch(/const open = \(\) => \{ setLogDateOverride\(null\)/);
  });

  it('the answer is still saved for the historical day, before the handoff', () => {
    const s = read(GATE);
    const save = s.indexOf("fetch('/api/logging/log-daily'");
    const handoff = s.indexOf('outcomeNeedsDuration(finalOutcome)');
    expect(save).toBeGreaterThan(-1);
    expect(handoff, 'the handoff must still come after the save').toBeGreaterThan(save);
    expect(s, 'and must still write the checked-in date').toMatch(/log_date: yesterdayStr/);
  });

  it('the !backdated guard on the fan-out is UNTOUCHED', () => {
    // It is correct: complete-task resolves the routine by its own today, so a
    // backdated log must never produce completions. Removing it was rejected.
    expect(read(APP)).toMatch(/if \(!backdated && data\.completedTasks/);
  });

  it('the sheet is not made date-aware — it still fetches today only', () => {
    expect(read('src/components/DailyTracker/LoggingModal.tsx'))
      .toMatch(/fetch\('\/api\/routine\/today'\)/);
  });
});
