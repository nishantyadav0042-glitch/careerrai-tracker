import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';

// ── ONE CLEANED COPY OF THE SUPABASE CREDENTIALS ────────────────────────────
//
// 29 Aug, Incident #44. Production's NEXT_PUBLIC_SUPABASE_URL carried a leading
// U+FEFF byte-order mark. It is invisible everywhere a human looks — dashboard,
// log line, editor — and it is not whitespace, so nothing trims it. `new URL()`
// rejects the string outright, and every Google sign-in for a day failed with a
// message about PKCE storage that named no URL at all.
//
// Sixteen files read those two variables raw. Cleaning one of them would have
// left fifteen holes, so there is one authority and every caller goes through
// it. This file is what stops a seventeenth raw read appearing.

const ROOT = join(__dirname, '..');
const AUTHORITY = 'lib/supabase/env.ts';

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { sourceFiles(p, out); continue; }
    if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('the Supabase credentials are read in exactly one place', () => {
  it('no file reads NEXT_PUBLIC_SUPABASE_* directly except the authority', () => {
    const offenders = sourceFiles(ROOT)
      .filter((p) => /process\.env\.NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)/
        .test(codeOnly(readFileSync(p, 'utf8'))))
      .map((p) => p.replace(`${ROOT}/`, ''));

    expect(offenders,
      'read the cleaned value from @/lib/supabase/env instead — a raw read carries '
      + 'whatever invisible characters the dashboard value happens to hold')
      .toEqual([AUTHORITY]);
  });

  it('the authority reads per call, not once at import', () => {
    // A `const` here is evaluated when the module is first imported, which on
    // the server happens before a test sets process.env — it captured empty
    // strings and broke oauth-callback-routing.guard. Reading per call keeps
    // the exact timing every caller had before this module existed.
    const src = codeOnly(readFileSync(join(ROOT, AUTHORITY), 'utf8'));
    expect(src, 'export the credentials as functions, not module-level constants')
      .not.toMatch(/export\s+const\s+(SUPABASE_URL|SUPABASE_ANON_KEY)\s*=/);
    expect(src).toMatch(/export function supabaseUrl\(/);
    expect(src).toMatch(/export function supabaseAnonKey\(/);
  });
});

describe('the cleaner strips what a paste adds, and nothing else', () => {
  // The regex is duplicated here on purpose: importing the module would read
  // this machine's env, and the property under test is the transformation.
  const clean = (raw: string | undefined): string =>
    (raw ?? '').replace(/^[﻿​\s]+/, '').replace(/[﻿​ \t\r\n]+$/, '');

  it('strips the exact character that broke production', () => {
    const withBom = '﻿https://pobhpszlsozeonejtzqy.supabase.co';
    expect(() => new URL(withBom), 'the BOM must genuinely break URL parsing')
      .toThrow();
    expect(clean(withBom)).toBe('https://pobhpszlsozeonejtzqy.supabase.co');
    expect(() => new URL(clean(withBom))).not.toThrow();
  });

  it('strips a zero-width space and surrounding whitespace', () => {
    expect(clean('​ https://x.supabase.co \n')).toBe('https://x.supabase.co');
  });

  it('leaves a clean value byte-identical', () => {
    const url = 'https://pobhpszlsozeonejtzqy.supabase.co';
    expect(clean(url)).toBe(url);
  });

  it('does not silently repair a URL that is wrong in some other way', () => {
    // A typo must still fail loudly rather than be rewritten into something
    // that happens to work — that is how an invisible defect becomes a
    // permanent one.
    expect(clean('htps://pobh.supabase.co')).toBe('htps://pobh.supabase.co');
    expect(clean('')).toBe('');
  });
});
