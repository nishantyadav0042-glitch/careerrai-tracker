/**
 * ── EVERY NEW TABLE SAYS WHO MAY REACH IT ──────────────────────────────────
 *
 * Supabase notice, received 23 Sep 2026: from 30 Oct 2026 a table created in
 * `public` is no longer granted to anon / authenticated / service_role by
 * default. A table without an explicit GRANT is unreachable through the Data
 * API — and PostgREST reports that as an `error` on the response, never as a
 * throw. Our server reads almost everything through the service-role client,
 * and much of it does not check `error`, so a missing grant would look like
 * an EMPTY table rather than a broken one: the exact silent shape of
 * Incident #104.
 *
 * On 23 Sep, 56 migrations created tables and 3 carried a GRANT. Every one
 * relied on the default this notice removes. Nothing existing breaks (those
 * tables keep their grants); the risk is the next table.
 *
 * The rule (CODEMAP invariant 11), for every migration after the cutoff:
 *   1. every `create table` in `public` is granted to `service_role` in the
 *      same file — the server's own client needs it;
 *   2. a grant to `authenticated` or `anon` requires row-level security to be
 *      enabled on that table in the same file — a browser-reachable table
 *      with no RLS is a table anyone signed in (or anyone at all) can read.
 *
 * Older migrations are grandfathered: they ran under the old default and
 * their tables already hold grants in production.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

/** Migrations sorting after this name must follow the rule. */
export const GRANTS_REQUIRED_AFTER = '20260923a_display_status_vocabulary.sql';

/** SQL without comments, so prose explaining a grant cannot satisfy the check. */
function sqlOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Tables this file creates in `public` (unqualified names are public). */
function createdTables(sql: string): string[] {
  const out: string[] = [];
  const re = /create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?"?(\w+)"?/gi;
  for (const m of sql.matchAll(re)) {
    const schema = (m[1] ?? 'public').toLowerCase();
    if (schema === 'public') out.push(m[2].toLowerCase());
  }
  return [...new Set(out)];
}

/** Roles this file grants anything on `table` to. */
function grantedRoles(sql: string, table: string): Set<string> {
  const roles = new Set<string>();
  const re = new RegExp(
    String.raw`grant\s+[^;]*?\bon\s+(?:table\s+)?(?:public\.)?"?${table}"?\s*(?:,[^;]*?)?\bto\s+([^;]+);`,
    'gi',
  );
  for (const m of sql.matchAll(re)) {
    for (const r of m[1].split(',')) roles.add(r.trim().toLowerCase());
  }
  return roles;
}

function rlsEnabled(sql: string, table: string): boolean {
  return new RegExp(
    String.raw`alter\s+table\s+(?:only\s+)?(?:public\.)?"?${table}"?\s+enable\s+row\s+level\s+security`,
    'i',
  ).test(sql);
}

/** Every violation in one migration's source, as human-readable lines. */
export function grantViolations(src: string): string[] {
  const sql = sqlOnly(src);
  const out: string[] = [];
  for (const t of createdTables(sql)) {
    const roles = grantedRoles(sql, t);
    if (!roles.has('service_role')) out.push(`${t}: no grant to service_role`);
    for (const r of ['authenticated', 'anon']) {
      if (roles.has(r) && !rlsEnabled(sql, t)) out.push(`${t}: granted to ${r} without enabling row level security`);
    }
  }
  return out;
}

describe('the rule itself (verified against the defects it exists to catch)', () => {
  const ok = `
    create table if not exists public.study_things (id uuid primary key);
    alter table public.study_things enable row level security;
    grant select, insert, update, delete on public.study_things to service_role;
    grant select on public.study_things to authenticated;`;

  it('passes a table granted to service_role, with RLS before any browser grant', () => {
    expect(grantViolations(ok)).toEqual([]);
  });

  it('fails a table with no grants at all — the 30 Oct default', () => {
    expect(grantViolations('create table public.x (id int);')).toEqual(['x: no grant to service_role']);
  });

  it('fails an unqualified create table too (it lands in public)', () => {
    expect(grantViolations('create table x (id int);')).toEqual(['x: no grant to service_role']);
  });

  it('fails a browser grant without RLS', () => {
    const src = `create table public.x (id int);
      grant all on public.x to service_role;
      grant select on public.x to anon;`;
    expect(grantViolations(src)).toEqual(['x: granted to anon without enabling row level security']);
  });

  it('a grant mentioned only in a comment does not count', () => {
    expect(grantViolations(`create table public.x (id int);
      -- grant all on public.x to service_role;`)).toEqual(['x: no grant to service_role']);
  });

  it('a grant on a different table does not count', () => {
    expect(grantViolations(`create table public.x (id int);
      grant all on public.xy to service_role;`)).toEqual(['x: no grant to service_role']);
  });

  it('accepts multi-role and "on table" forms', () => {
    expect(grantViolations(`create table public.x (id int);
      alter table public.x enable row level security;
      grant select on table public.x to authenticated, service_role;`)).toEqual([]);
  });

  it('ignores tables created outside public', () => {
    expect(grantViolations('create table private.x (id int);')).toEqual([]);
  });
});

describe('every migration after the cutoff follows it', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

  it('the cutoff migration exists, so the boundary is real', () => {
    expect(files).toContain(GRANTS_REQUIRED_AFTER);
  });

  it('no post-cutoff migration creates an ungranted or RLS-less browser table', () => {
    const bad: string[] = [];
    for (const f of files.filter((n) => n > GRANTS_REQUIRED_AFTER)) {
      for (const v of grantViolations(readFileSync(join(DIR, f), 'utf8'))) bad.push(`${f} — ${v}`);
    }
    expect(bad, 'Supabase stops default grants on 30 Oct 2026; see CODEMAP invariant 11').toEqual([]);
  });
});
