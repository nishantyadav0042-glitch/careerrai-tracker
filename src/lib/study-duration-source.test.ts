import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  STUDY_DURATION_SOURCES, isStudyDurationSource, sourceForMergedDuration,
  type StudyDurationSource,
} from './study-duration-source';

// ── G5 — provenance for study_duration, and nothing else ────────────────────
//
// J6-A: "a duration value may be presented as self-reported or as credited ONLY
// when its provenance is actually established." The column could not say that —
// NUMERIC(4,1) NOT NULL DEFAULT 0 has no way to express "we never asked".
//
// This gate adds ONE nullable column and the authority that decides what goes
// in it. It does not split the column, does not backfill, does not touch the 30
// consumers, and does not create credited_study_duration.
//
// THE RULE THAT MATTERS MOST — STAMP THE WINNER.
//
// complete-task stores `Math.max(earned, existingLog?.study_duration ?? 0)`.
// The naive implementation stamps every such write 'credited' because the credit
// path ran. But when the max keeps the PRE-EXISTING number, the value that got
// stored is not the credited one — and stamping it 'credited' manufactures
// exactly the false provenance J6-A exists to forbid. The stamp must describe
// the value that actually won.

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

describe('the vocabulary is closed and exactly four values', () => {
  it('names the four provenances the design audit ruled on', () => {
    expect([...STUDY_DURATION_SOURCES].sort()).toEqual(
      ['credited', 'declared_zero', 'not_collected', 'self_reported']
    );
  });

  it('rejects anything outside it — NULL is the only other legal state', () => {
    expect(isStudyDurationSource('credited')).toBe(true);
    expect(isStudyDurationSource('legacy')).toBe(false);
    expect(isStudyDurationSource('unknown')).toBe(false);
    expect(isStudyDurationSource(null)).toBe(false);
    expect(isStudyDurationSource(undefined)).toBe(false);
    expect(isStudyDurationSource('')).toBe(false);
  });
});

describe('sourceForMergedDuration — stamp the winner, never the intent', () => {
  it('no existing row: the credited value is definitionally the winner', () => {
    expect(sourceForMergedDuration({ earned: 2.5, existing: null, existingSource: null }))
      .toBe('credited');
    // Even a credited ZERO is credited: the pricing ran and produced 0.
    expect(sourceForMergedDuration({ earned: 0, existing: null, existingSource: null }))
      .toBe('credited');
  });

  it('credited value beats the existing one: stamp credited', () => {
    expect(sourceForMergedDuration({ earned: 4, existing: 1, existingSource: null }))
      .toBe('credited');
    expect(sourceForMergedDuration({ earned: 4, existing: 0, existingSource: 'not_collected' }))
      .toBe('credited');
  });

  it('THE CORE CASE — the existing value survives the max, so its source survives too', () => {
    // A hand-made log of 6h, then a routine tick worth 2h. The 6 survives.
    // Stamping this 'credited' would assert that 6h was priced from coverage.
    expect(sourceForMergedDuration({ earned: 2, existing: 6, existingSource: 'self_reported' }))
      .toBe('self_reported');
  });

  it('a legacy NULL survives as NULL — never upgraded to a guess', () => {
    // All 293 historical rows are NULL. If one wins a merge, it stays unknown.
    expect(sourceForMergedDuration({ earned: 1, existing: 5, existingSource: null }))
      .toBeNull();
  });

  it('a tie leaves the stored number unchanged, so its provenance is unchanged', () => {
    expect(sourceForMergedDuration({ earned: 3, existing: 3, existingSource: 'credited' }))
      .toBe('credited');
    expect(sourceForMergedDuration({ earned: 3, existing: 3, existingSource: null }))
      .toBeNull();
    // 0 vs 0 on a check-in day: no credit was earned, nothing was collected.
    expect(sourceForMergedDuration({ earned: 0, existing: 0, existingSource: 'not_collected' }))
      .toBe('not_collected');
  });

  it('is idempotent — a retry re-deriving the same inputs cannot corrupt the source', () => {
    const args = { earned: 2, existing: 6, existingSource: 'declared_zero' as StudyDurationSource };
    const once = sourceForMergedDuration(args);
    expect(sourceForMergedDuration({ ...args, existingSource: once })).toBe(once);
  });
});

describe('the migration adds the column and the CHECK, and touches no row', () => {
  const migration = () => {
    const dir = join(process.cwd(), 'supabase/migrations');
    const f = readdirSync(dir).find((n) => n.includes('study_duration_provenance'));
    expect(f, 'a provenance migration must exist').toBeTruthy();
    return readFileSync(join(dir, f as string), 'utf8');
  };

  it('adds a NULLABLE column — metadata-only on PG11+, so no table rewrite', () => {
    // Scope this to the ADD COLUMN statement alone. The RPC's new PARAMETER is
    // `p_study_duration_source text DEFAULT NULL`, and that default is correct
    // and load-bearing — it keeps the argument optional. Only the COLUMN must
    // be free of NOT NULL / DEFAULT, which is what avoids a table rewrite.
    const addColumn = /alter table public\.daily_reports\s+add column if not exists study_duration_source text\s*;/i;
    expect(migration(), 'the column must be plain nullable TEXT with no default')
      .toMatch(addColumn);
  });

  it('constrains the vocabulary in the database, not only in TypeScript', () => {
    const sql = migration();
    for (const v of STUDY_DURATION_SOURCES) expect(sql).toContain(`'${v}'`);
    expect(sql).toMatch(/check/i);
  });

  it('writes NOTHING to existing rows — no UPDATE, no backfill', () => {
    // The RPC's own body legitimately UPDATEs daily_reports — that is the
    // function doing its job on a future write, not this migration touching
    // history. What must not exist is a statement at MIGRATION scope, so the
    // function body is excised before checking.
    const sql = migration()
      .replace(/--[^\n]*/g, '')
      .replace(/AS \$function\$[\s\S]*?\$function\$;/i, 'AS $function$ ... $function$;');
    expect(sql, 'J6-A forbids rewriting historical values').not.toMatch(/\bupdate\s+public\.daily_reports\b/i);
    expect(sql).not.toMatch(/\bupdate\s+daily_reports\b/i);
    expect(sql, 'no backfill of the new column').not.toMatch(/set\s+study_duration_source\s*=/i);
  });

  it('follows the 20260812 DROP/CREATE precedent and restores the exact ACL', () => {
    const sql = migration();
    // Verified live: one overload only, acl = postgres=X | service_role=X.
    // Adding a parameter without dropping the old signature creates an
    // ambiguous overload; leaving the ACL unset re-grants EXECUTE to PUBLIC.
    expect(sql).toMatch(/drop function if exists public\.upsert_log_and_streak\(uuid, ?date, ?numeric, ?text\[\], ?text, ?boolean, ?text, ?text\[\]\)/i);
    expect(sql).toMatch(/revoke all on function public\.upsert_log_and_streak/i);
    expect(sql).toMatch(/grant execute on function public\.upsert_log_and_streak[\s\S]{0,200}to service_role/i);
    expect(sql).toMatch(/p_study_duration_source text/i);
  });
});

describe('both writers stamp atomically, in the same statement as the value', () => {
  it('log-daily passes a validated source to the RPC', () => {
    const src = code('src/app/api/logging/log-daily/route.ts');
    expect(src).toMatch(/p_study_duration_source:/);
    expect(src, 'an unknown/absent client declaration must stay NULL, not be guessed')
      .toContain('isStudyDurationSource');
  });

  it('complete-task reads the existing source so it can preserve a winner', () => {
    const src = code('src/app/api/routine/complete-task/route.ts');
    expect(src).toContain('study_duration_source');
    expect(src, 'it must use the authority, not inline a second copy of the rule')
      .toContain('sourceForMergedDuration');
    expect(src).toMatch(/p_study_duration_source:/);
  });

  it('neither writer hard-codes credited next to the merge', () => {
    const src = code('src/app/api/routine/complete-task/route.ts');
    expect(src, "stamping 'credited' beside mergedHours is the exact bug this gate exists to prevent")
      .not.toMatch(/p_study_duration_source:\s*'credited'/);
  });
});

describe('scope containment — G5 is the column and nothing else', () => {
  it('the consumers still awaiting a ruling are untouched', () => {
    // G5 itself migrated no consumer, and this guard held that. Three of the
    // named ones have since been migrated under EXPLICIT founder rulings —
    // analytics.ts (Q3), the capacity callers (Q4), weekly-plan-reconcile (Q5)
    // — so pinning them here would now assert the opposite of what was decided.
    // The invariant that survives is the one that still matters: a consumer
    // moves only when it has been ruled on. These two have not been.
    expect(code('src/lib/buddy-case-data.ts')).toContain('Number(r.study_duration) || 0');
    expect(code('src/lib/prep-gain.ts')).toContain('Number(row.study_duration)');
    for (const p of ['src/lib/buddy-case-data.ts', 'src/lib/prep-gain.ts']) {
      expect(code(p), `${p} must not have quietly become source-aware`)
        .not.toContain('durationIsUnknown');
    }
  });

  it('credited_study_duration is still not created', () => {
    for (const p of ['src/lib/study-duration-source.ts', 'src/app/api/logging/log-daily/route.ts',
                     'src/app/api/routine/complete-task/route.ts']) {
      expect(code(p)).not.toContain('credited_study_duration');
      expect(code(p)).not.toContain('self_reported_study_duration');
    }
  });

  it('the duration values themselves are computed exactly as before', () => {
    expect(code('src/app/api/routine/complete-task/route.ts'))
      .toContain('const mergedHours = Math.max(earned, existingLog?.study_duration ?? 0);');
    expect(code('src/app/api/logging/log-daily/route.ts')).toMatch(/p_study_duration:\s*body\.hours,/);
  });
});
