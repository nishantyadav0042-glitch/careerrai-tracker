import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── A failed read is not an authorization answer ───────────────────────────
//
// 21 Aug. The founder tapped Buddies in the admin panel and landed on the
// login screen. Supabase auth logs for that minute are all 200 — the session
// was healthy and was never rejected by anything. The bounce came from the
// admin gate itself:
//
//   const { data: me } = await admin.from('profiles').select('role')...
//   if (me?.role !== 'admin') redirect('/login');
//
// `error` was never read. One flaky profiles read — a cold lambda, a
// connection blip, a deploy flip — and a signed-in admin is told to log in
// again. The same shape sat in 48 places across admin and sales pages.
//
// This is the failure this codebase keeps paying for in new costumes: a
// system failure rendered as a confident negative answer. "I could not read
// your role" is not "you are not an admin", and the difference is the whole
// point: one is an outage, the other is a decision about a person.

const read = (p: string) => readFileSync(p, 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the page gate never turns an outage into a logout', () => {
  const src = () => code('src/lib/admin-auth.ts');

  it('reads the error, not just the data', () => {
    expect(src()).toMatch(/const \{ data, error \}/);
  });

  it('retries once before giving up — a blip should be invisible', () => {
    expect(src()).toMatch(/attempt < 2|attempt === 1/);
  });

  it('throws on a persistent failure instead of redirecting to login', () => {
    const s = src();
    const reader = s.slice(s.indexOf('async function readRole'), s.indexOf('export async function requireAdmin'));
    expect(reader, 'a failed read must surface as an error').toContain('throw new Error');
    expect(reader, 'a failed read must never send someone to /login').not.toContain('/login');
  });

  it('redirects only on a role it actually received', () => {
    const s = src();
    // The decision must read the RESOLVED role, never raw data that could be
    // null because the query failed. The destination is deliberately not
    // pinned here — this guard once demanded the literal redirect('/login')
    // and failed the day that became homeForRole(role), which is a better
    // answer. Pin the idea (decide from `role`), not the characters.
    expect(s).toMatch(/if \(role !== 'admin'\) redirect\(/);
    expect(s).not.toMatch(/me\?\.role !== 'admin'/);
  });
});

describe('the API gate distinguishes "cannot tell" from "not allowed"', () => {
  const src = () => code('src/lib/require-admin.ts');

  it('answers 503 when the role read failed', () => {
    const s = src();
    expect(s).toContain('status: 503');
    // And the 503 must come from the error branch, before the 403.
    expect(s.indexOf('status: 503')).toBeLessThan(s.lastIndexOf("status: 403"));
  });

  it('still answers 403 for a real non-admin', () => {
    expect(src()).toMatch(/profile\?\.role !== 'admin'[\s\S]{0,120}403/);
  });

  it('logs the failure rather than swallowing it', () => {
    expect(src()).toContain('role read failed');
  });
});
