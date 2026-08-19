import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── The financial ledger is written by the server, or not at all ────────────
//
// student_payments carried INSERT/UPDATE/DELETE for anon and authenticated
// until 19 Aug. Nothing could use them -- RLS is on and the table has one
// SELECT-only policy, so writes were denied by deny-by-default, and a probe as
// both roles confirmed it. But that made the ledger protected by ONE mechanism
// where every evidence table is protected by two, and one mistaken
// `create policy ... for insert` is the whole distance between "denied" and
// "any logged-in student writes rows into the financial ledger".
//
// The migration revoked the write grants. This test stops the two ways that
// protection could be undone without anyone noticing:
//
//   1. a later migration re-granting the write, and
//   2. a route reaching the ledger with a client that is not service_role.
//
// It does NOT re-check the grants in the live database -- tests have no
// database. It checks the two things that are in the repo and would have to
// change first.

const ROOT = process.cwd();

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|--).*$/gm, '');
}

describe('the payment ledger stays server-write-only', () => {
  it('has a migration revoking client writes', () => {
    const dir = join(ROOT, 'supabase/migrations');
    const revokes = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => stripComments(readFileSync(join(dir, f), 'utf8')))
      .filter((sql) => /revoke[\s\S]{0,80}on\s+public\.student_payments/i.test(sql));
    expect(revokes.length, 'the revoke migration must exist').toBeGreaterThan(0);
  });

  it('never re-grants a write on the ledger to a client role', () => {
    const dir = join(ROOT, 'supabase/migrations');
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
      const sql = stripComments(readFileSync(join(dir, f), 'utf8'));
      // A grant is only a problem if it names a write verb AND a client role.
      for (const m of sql.matchAll(/grant\s+([\s\S]*?)\s+on\s+(?:table\s+)?public\.student_payments\s+to\s+([^;]+);/gi)) {
        const verbs = m[1].toLowerCase();
        const roles = m[2].toLowerCase();
        const writes = /insert|update|delete|all/.test(verbs);
        const clientRole = /\banon\b|\bauthenticated\b/.test(roles);
        if (writes && clientRole) offenders.push(`${f}: grants ${verbs.trim()} to ${roles.trim()}`);
      }
    }
    expect(offenders, 'the ledger must never be writable by anon or authenticated').toEqual([]);
  });

  it('gives the ledger no write policy — RLS stays deny-by-default for writes', () => {
    const dir = join(ROOT, 'supabase/migrations');
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
      const sql = stripComments(readFileSync(join(dir, f), 'utf8'));
      for (const m of sql.matchAll(/create\s+policy[\s\S]*?on\s+public\.student_payments([\s\S]*?);/gi)) {
        if (/\bfor\s+(insert|update|delete|all)\b/i.test(m[1])) offenders.push(`${f}: adds a write policy`);
      }
    }
    // Belt and braces: the revoke closes the grant, this keeps the second lock
    // shut. Either one alone was the arrangement we just moved away from.
    expect(offenders, 'a write policy would reopen what the revoke closed').toEqual([]);
  });

  it('reaches the ledger only through the service-role client', () => {
    // Every writer in src/ uses lib/supabase/admin. A file that touches
    // student_payments while importing the browser or user-scoped server client
    // is either a read that should use admin too, or a write that is about to
    // start failing -- both worth catching here rather than in production.
    const offenders: string[] = [];
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        return e.isDirectory() ? walk(p) : /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
      });
    for (const f of walk(join(ROOT, 'src'))) {
      const code = stripComments(readFileSync(f, 'utf8'));
      if (!code.includes('student_payments')) continue;
      const usesClientSide = /from\s+['"]@\/lib\/supabase\/client['"]/.test(code);
      if (usesClientSide) offenders.push(f.replace(`${ROOT}/`, ''));
    }
    expect(offenders, 'the ledger must not be reachable from a browser client').toEqual([]);
  });
});
