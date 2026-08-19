import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── A write grant nobody can use is still a write grant ────────────────────
//
// Supabase hands anon and authenticated INSERT/UPDATE/DELETE on nearly every
// table by default. On 60 of ours, RLS was on and there was not one write
// policy, so those writes were already refused by deny-by-default -- unusable
// today, and one permissive policy away from "any logged-in student writes this
// table". The migration removed them.
//
// This test guards the direction of travel, not a fixed list: a migration may
// not grant a client role a write on a table unless it says why in the same
// file. The escape hatch is deliberate -- some table will legitimately need
// browser writes one day -- but it has to be written down at the moment it is
// granted, where a reviewer sees it.

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');

/** GRANTs of a write verb to a client role, as (file, statement) pairs. */
function clientWriteGrants(): { file: string; stmt: string }[] {
  const out: { file: string; stmt: string }[] = [];
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql'))) {
    const sql = strip(readFileSync(join(MIGRATIONS, f), 'utf8'));
    for (const m of sql.matchAll(/grant\s+([^;]*?)\s+on\s+(?:table\s+)?([^\s;]+)\s+to\s+([^;]+);/gi)) {
      const [, verbs, table, roles] = m;
      if (!/insert|update|delete|\ball\b/i.test(verbs)) continue;
      if (!/\banon\b|\bauthenticated\b/i.test(roles)) continue;
      out.push({ file: f, stmt: `${table} <- ${verbs.trim()} to ${roles.trim()}` });
    }
  }
  return out;
}

describe('client write grants are deliberate, not inherited', () => {
  it('the revoke migration exists and covers many tables', () => {
    const f = readdirSync(MIGRATIONS).find((n) => n.includes('revoke_unusable_client_write_grants'));
    expect(f, 'the revoke migration must exist').toBeTruthy();
    const sql = strip(readFileSync(join(MIGRATIONS, f!), 'utf8'));
    const revokes = [...sql.matchAll(/^REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.\w+\s+FROM\s+anon,\s*authenticated;/gim)];
    expect(revokes.length, 'the migration must revoke the full audited set').toBeGreaterThanOrEqual(60);
  });

  it('leaves SELECT alone — this is about writes, not about hiding data', () => {
    const f = readdirSync(MIGRATIONS).find((n) => n.includes('revoke_unusable_client_write_grants'))!;
    const sql = strip(readFileSync(join(MIGRATIONS, f), 'utf8'));
    expect(sql, 'revoking SELECT would break every read policy').not.toMatch(/REVOKE[^;]*SELECT/i);
  });

  it('never revokes anything from service_role', () => {
    const f = readdirSync(MIGRATIONS).find((n) => n.includes('revoke_unusable_client_write_grants'))!;
    const sql = strip(readFileSync(join(MIGRATIONS, f), 'utf8'));
    expect(sql, 'the server write path must survive').not.toMatch(/FROM[^;]*service_role/i);
  });

  it('any NEW client write grant is justified in its own migration', () => {
    // Three migrations pre-date this rule and are baselined by name rather than
    // rewritten -- editing an applied migration changes history without changing
    // the database, which is worse than recording the exception here.
    //
    //   018_daily_tracker_schema / 20260605_...  : GRANT ALL from the original
    //     schema, before any of this discipline existed. Several of those tables
    //     have since had the write revoked anyway (streak_data by 20260819d,
    //     daily_lrdi_puzzles by this batch); the rest are in the remaining 23
    //     and are a known, bounded follow-up.
    //   20260819d_profiles_protected_columns    : the DELIBERATE one. It grants
    //     a column-scoped UPDATE by subtraction, which is the mechanism that
    //     protects role/buddy_id/is_premium. It must keep passing.
    const BASELINE = [
      '018_daily_tracker_schema.sql',
      '20260605_add_streak_and_alerts_tables.sql',
      '20260819d_profiles_protected_columns.sql',
    ];
    const unjustified = clientWriteGrants().filter(({ file }) => {
      if (BASELINE.includes(file)) return false;
      const raw = readFileSync(join(MIGRATIONS, file), 'utf8');
      // A comment saying why a browser write is needed must be present.
      return !/browser write|client write|intentionally granted|needs? (a )?client/i.test(raw);
    });
    expect(
      unjustified.map((u) => `${u.file}: ${u.stmt}`),
      'granting a browser write is allowed, but say why in the migration',
    ).toEqual([]);
  });
});
