import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── Fractional study hours must survive the whole log path ─────────────────
//
// 12 Aug 2026, 22:53 IST. A student marked one task "Done" and one "Half",
// pressed Save log, and got "Internal server error" — then pressed it again,
// and again, roughly 25 times in two minutes. Postgres was rejecting every
// attempt with 22P02: invalid input syntax for type integer: "4.6".
//
// daily_reports.study_duration is NUMERIC and always accepted decimals. The
// RPC that writes it declared p_study_duration INTEGER. The function
// contradicted its own table, and the app's own UI ("Half") is what produced
// the fractional value.
//
// The tempting fix was Math.round() in the route. That would have "worked" and
// quietly lied about how long a student studied — the log is sacred (Learning
// OS), so the type was fixed instead.
//
// This guard is deliberately about SHAPE, not about the database: it pins the
// two facts that made the bug possible, so a future edit cannot reintroduce
// either half of it.

describe('the daily log accepts fractional hours, end to end', () => {
  it('the route sends hours through UNROUNDED — a log never lies about time', () => {
    const route = readFileSync('src/app/api/logging/log-daily/route.ts', 'utf8');
    // The hours the student is credited with must be the hours they reported.
    expect(route).toContain('p_study_duration:  body.hours');
    // If someone "fixes" a future type error by rounding, this fails first.
    expect(route).not.toMatch(/p_study_duration:\s*Math\.round/);
  });

  it('the migration declares the RPC parameter as NUMERIC, never integer', () => {
    const sql = readFileSync('supabase/migrations/20260812_log_daily_hours_accept_decimals.sql', 'utf8');
    expect(sql).toContain('p_study_duration numeric');
    // The old signature must be dropped, or Postgres keeps BOTH overloads and
    // the integer one can still be chosen — the bug would survive its own fix.
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.upsert_log_and_streak(uuid, date, integer');
  });

  it('the migration restores the grants that DROP removes (Incident #14)', () => {
    const sql = readFileSync('supabase/migrations/20260812_log_daily_hours_accept_decimals.sql', 'utf8');
    // Dropping a function drops its ACL. Without the GRANT, the service role
    // loses EXECUTE and logging breaks a SECOND way — which is exactly how a
    // security sweep once revoked the one grant that mattered.
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.upsert_log_and_streak');
    expect(sql).toContain('TO service_role');
    // And a fresh CREATE grants PUBLIC by default — a SECURITY DEFINER
    // function must never be left open to anon.
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.upsert_log_and_streak[\s\S]*FROM public, anon, authenticated/);
  });

  it('validation allows the fractional hours the UI can actually produce', () => {
    const route = readFileSync('src/app/api/logging/log-daily/route.ts', 'utf8');
    // Range check only — no integer check. A "Half" task on a 9.2h day is 4.6.
    expect(route).toContain('body.hours > 24');
    expect(route).not.toContain('Number.isInteger(body.hours)');
  });
});
