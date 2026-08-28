import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── Incident #34: no SECURITY DEFINER function reachable by a stranger ──────
//
// PostgREST publishes every executable public function at /rest/v1/rpc/<name>.
// A SECURITY DEFINER function runs with the definer's rights and bypasses RLS.
// The two together mean: anyone holding the public anon key can run it.
//
// public.claim_lead(uuid,uuid) was exactly that — unauthenticated rewrite of
// any student lead's ownership, with no trace of who called it. Since 28 Aug
// that ownership also decides who gets paid (sales_conversions), so the same
// hole is now a lever on payroll.
//
// WHAT THIS GUARD CAN AND CANNOT PROVE, stated plainly because the distinction
// matters: it reads MIGRATIONS, not the live database. It cannot see a grant
// made by hand in the Supabase console. What it does catch is the regression
// that actually happens — a future migration re-granting one of these to anon,
// or a new SECURITY DEFINER function shipped with no revoke beside it. The
// live grants were verified directly against production on 28 Aug 2026 and
// recorded in 20260828b.

const DIR = join(process.cwd(), 'supabase', 'migrations');
const migrations = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const all = migrations.map((f) => [f, readFileSync(join(DIR, f), 'utf8')] as const);
const sql = all.map(([, c]) => c).join('\n');

/** SQL comments stripped, so prose about a grant is never read as a grant. */
function codeOnly(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
}
const code = codeOnly(sql);

const LOCKED = ['claim_lead', 'refresh_buddy_demo_account', 'refresh_review_account_logs'];

describe('the sweep sees the migrations', () => {
  it('reads a real migration set', () => {
    expect(migrations.length).toBeGreaterThan(50);
    expect(migrations.some((f) => f.includes('claim_lead_lockdown'))).toBe(true);
  });
});

describe('the three student-reachable RPCs are revoked', () => {
  for (const fn of LOCKED) {
    it(`${fn} is revoked from anon and authenticated`, () => {
      const revoke = new RegExp(
        `revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)\\s*from\\s+([^;]*);`, 'i');
      const m = code.match(revoke);
      expect(m, `no REVOKE found for ${fn}`).not.toBeNull();
      const from = (m![1] || '').toLowerCase();
      // Naming the roles explicitly matters (Incident #33): revoking from
      // PUBLIC alone leaves direct grants to anon and authenticated in place,
      // and the function stays reachable while the diff looks like a fix.
      expect(from, `${fn} must name anon explicitly, not just PUBLIC`).toContain('anon');
      expect(from, `${fn} must name authenticated explicitly`).toContain('authenticated');
    });
  }
});

describe('nothing hands them back afterwards', () => {
  it('no migration grants any of them to anon or authenticated', () => {
    const offenders: string[] = [];
    for (const [file, content] of all) {
      const c = codeOnly(content);
      for (const fn of LOCKED) {
        const grant = new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}[^;]*to[^;]*\\b(anon|authenticated|public)\\b`, 'i');
        if (grant.test(c)) offenders.push(`${file} → ${fn}`);
      }
    }
    expect(offenders, 'These re-open Incident #34:\n  ' + offenders.join('\n  ')).toEqual([]);
  });

  it('the lockdown is the LAST word on claim_lead', () => {
    // Ordering is the whole point: a revoke in an earlier migration that a
    // later one overrides is not a fix. Migrations apply in filename order.
    const lockdown = migrations.findIndex((f) => f.includes('claim_lead_lockdown'));
    const laterTouchingClaim = migrations
      .slice(lockdown + 1)
      .filter((f) => /claim_lead/i.test(codeOnly(readFileSync(join(DIR, f), 'utf8'))));
    expect(laterTouchingClaim, 'a later migration touches claim_lead — re-verify its grants').toEqual([]);
  });
});

describe('the free-text overload is gone', () => {
  it('claim_lead(uuid, text) is dropped', () => {
    // A SECURITY DEFINER function whose owner argument is free text should not
    // outlive the day someone notices it. It had no callers — /api/sales/log
    // passes uuids.
    expect(code).toMatch(/drop function if exists public\.claim_lead\(uuid,\s*text\)/i);
  });

  it('no route calls claim_lead with a non-uuid owner', () => {
    const routes = join(process.cwd(), 'src', 'app', 'api');
    const found: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.ts')) {
          const c = readFileSync(full, 'utf8');
          if (/rpc\(['"]claim_lead['"]/.test(c) && !/p_owner_id:\s*principal\.id/.test(c)) {
            found.push(full.slice(process.cwd().length + 1));
          }
        }
      }
    };
    walk(routes);
    expect(found, 'claim_lead must be called with a canonical profiles.id').toEqual([]);
  });
});
