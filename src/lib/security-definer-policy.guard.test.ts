import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── THE SECURITY DEFINER POLICY, AS A BUILD CONDITION ───────────────────────
//
// Founder, 22 Sep 2026: "Security tooling identifies candidates; application/
// database dependency analysis determines remediation… The goal is zero
// institutional memory required."
//
// THIS GUARD EXISTS BECAUSE THE SAME MISTAKE WAS MADE TWICE, TEN WEEKS APART.
//
// 12 July, migration 20260712_revoke_public_execute_definer_fns.sql, in its
// own words: "an earlier hardening pass revoked EXECUTE from anon/authenticated
// on these SECURITY DEFINER functions but NEVER REVOKED THE DEFAULT PUBLIC
// GRANT. anon inherits PUBLIC, so the functions stayed callable via PostgREST
// RPC — most importantly upsert_log_and_streak, which let a holder of the
// public anon key FORGE ANY STUDENT'S DAILY LOG + STREAK."
//
// 22 September, same repository: a hardening pass revoked EXECUTE from anon on
// two SECURITY DEFINER functions, reported success, and changed nothing —
// because anon held the grant through PUBLIC. The answer was already written
// down in a migration nobody re-read.
//
// A lesson in a comment is a lesson that gets repeated. This file is the same
// lesson with a compiler behind it.
//
// SCOPE: these rules read MIGRATION SOURCE, not the live database, so they run
// in CI with no credentials. The live state is inventoried separately in
// docs/security/SECURITY-DEFINER-INVENTORY.md, regenerated with
// scripts/security/definer-inventory.sql.

const DIR = 'supabase/migrations';

/**
 * Rules 1 and 4 apply from this date forward.
 *
 * Six migrations before it create SECURITY DEFINER functions with no
 * `SET search_path`. Every one of those functions HAS a fixed search_path in
 * production — migration 20260922c set them — and editing the historical files
 * to match would be rewriting the record of what actually ran. History is
 * remediated in the database; the guard governs what is added from here.
 */
const ENFORCED_FROM = '20260922';

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const dated = (f: string) => (f.match(/^(\d{8})/)?.[1] ?? '00000000');
const read = (f: string) => readFileSync(join(DIR, f), 'utf8');
/** SQL comments stripped: a rule must judge what RUNS, not what is explained. */
const sql = (s: string) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the guard can see the migrations', () => {
  it('walks a real directory', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => dated(f) >= ENFORCED_FROM)).toBe(true);
  });
});

describe('a SECURITY DEFINER function pins its search_path', () => {
  // A mutable search_path lets an attacker who can create a schema object
  // decide what an unqualified name inside a definer function resolves to.
  it.each(files.filter((f) => dated(f) >= ENFORCED_FROM))('%s', (f) => {
    const body = sql(read(f));
    const offenders: string[] = [];
    // Each CREATE FUNCTION block up to its body delimiter.
    const blocks = body.match(/create\s+(or\s+replace\s+)?function[\s\S]*?as\s+\$/gi) ?? [];
    for (const b of blocks) {
      if (/security\s+definer/i.test(b) && !/set\s+search_path/i.test(b)) {
        offenders.push((b.match(/function\s+([\w.]+)/i)?.[1] ?? '?'));
      }
    }
    expect(offenders, `SECURITY DEFINER without SET search_path in ${f}: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('EXECUTE is never granted to PUBLIC or anon', () => {
  // Enforced across ALL history, because it holds across all history today and
  // there is no future in which granting anon EXECUTE on a definer function is
  // the right answer. If one is ever needed, it argues for itself here.
  it.each(files)('%s', (f) => {
    const bad = sql(read(f)).match(/grant\s+execute[\s\S]{0,200}?to\s+(public|anon)\b/gi) ?? [];
    expect(bad.map((s) => s.replace(/\s+/g, ' ').trim()), `EXECUTE granted to public/anon in ${f}`).toEqual([]);
  });
});

describe('revoking from anon without PUBLIC is the bug this repo made twice', () => {
  // THE LOAD-BEARING RULE.
  //
  // `revoke execute ... from anon` is a NO-OP when the function still carries
  // the default PUBLIC grant, because anon inherits it. It reports success and
  // leaves the function callable. That is 12 July's incident and 22 September's
  // repeat of it.
  //
  // So: any REVOKE EXECUTE naming anon must name public in the same statement.
  const EXEMPT: Record<string, string> = {
    // Kept deliberately: this file's anon-only revokes ARE the no-op, left in
    // place with their post-mortem so the next reader meets the mistake rather
    // than a tidied-up history. 20260922d does the real revoke, from PUBLIC.
    '20260922c_security_advisor_hardening.sql':
      'the recorded no-op; corrected by 20260922d',
  };

  it.each(files)('%s', (f) => {
    if (EXEMPT[f]) return;
    const stmts = sql(read(f)).split(';');
    const bad = stmts
      .filter((s) => /revoke\s+execute/i.test(s) && /\banon\b/i.test(s) && !/\bpublic\b/i.test(s))
      .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, 110));
    expect(
      bad,
      `${f} revokes EXECUTE from anon without PUBLIC — anon inherits PUBLIC, so this is a no-op ` +
      `that will report success and change nothing. See 20260712 and 20260922c/d.`,
    ).toEqual([]);
  });

  it('the exemption list stays honest — every entry still exists', () => {
    for (const f of Object.keys(EXEMPT)) expect(files, `stale exemption: ${f}`).toContain(f);
  });
});

describe('a new SECURITY DEFINER function is documented before it ships', () => {
  // Zero institutional memory required: the inventory is the place someone
  // looks, so a function that is not in it does not exist as far as review is
  // concerned.
  const INVENTORY = 'docs/security/SECURITY-DEFINER-INVENTORY.md';

  it('the inventory exists and is not a stub', () => {
    const doc = readFileSync(INVENTORY, 'utf8');
    expect(doc.length).toBeGreaterThan(1200);
    expect(doc).toMatch(/search_path/i);
  });

  it('every definer function created since the cutoff is listed in it', () => {
    const doc = readFileSync(INVENTORY, 'utf8');
    const missing: string[] = [];
    for (const f of files.filter((x) => dated(x) >= ENFORCED_FROM)) {
      const blocks = sql(read(f)).match(/create\s+(or\s+replace\s+)?function[\s\S]*?as\s+\$/gi) ?? [];
      for (const b of blocks) {
        if (!/security\s+definer/i.test(b)) continue;
        const name = (b.match(/function\s+(?:public\.)?(\w+)/i)?.[1] ?? '').trim();
        if (name && !doc.includes(name)) missing.push(`${name} (${f})`);
      }
    }
    expect(missing, `SECURITY DEFINER functions missing from ${INVENTORY}:\n  ${missing.join('\n  ')}`).toEqual([]);
  });
});
