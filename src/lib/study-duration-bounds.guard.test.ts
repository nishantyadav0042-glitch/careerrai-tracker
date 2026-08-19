import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── The stored duration cannot be a number no day could contain ─────────────
//
// study_duration had no constraint at all. Until today's revoke it was
// client-reachable, so 500 hours was storable by anyone; now it is a
// server-bug backstop. The bound deliberately MATCHES the API's own validation
// rather than being tighter -- a CHECK stricter than the route would refuse
// writes the route accepts, converting a clean 400 into a 500.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MIGRATION = 'supabase/migrations/20260819h_study_duration_bounds.sql';
const sql = () => read(MIGRATION).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('the constraint matches the API contract', () => {
  it('bounds are 0..24', () => {
    expect(sql()).toMatch(/check \(study_duration >= 0 and study_duration <= 24\)/i);
  });

  it('the route enforces the same range', () => {
    // If either side moves, they must move together.
    expect(read('src/app/api/logging/log-daily/route.ts'))
      .toMatch(/body\.hours < 0 \|\| body\.hours > 24/);
  });

  it('is additive — no data is rewritten to fit it', () => {
    const s = sql();
    expect(s).not.toMatch(/UPDATE |DELETE FROM|INSERT INTO/i);
  });

  it('is re-runnable', () => {
    expect(sql()).toMatch(/drop constraint if exists daily_reports_study_duration_bounds/i);
  });

  it('touches only this column', () => {
    const s = sql();
    expect(s).not.toMatch(/study_duration_source|day_outcome|confidence|topics_covered/);
  });
});
