import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import columnsJson from './__fixtures__/profiles-columns.json';

// A select list naming a column that does not exist fails the WHOLE query at
// runtime — and because most callers don't capture the error, the failure
// wears a disguise: `.single()` returns null and the code concludes "row not
// found". That exact chain put `need_check` (never a real column) into the
// buddy student page's select, and every buddy tapping View on every student
// got a 404 (7 Aug). TypeScript cannot catch it — untyped supabase select
// strings are just strings.
//
// This test can. It walks the source, pulls every `.from('profiles')...
// .select('...')` literal, and checks each named column against a snapshot of
// the live schema. When a migration adds a profiles column, regenerate:
//   select column_name from information_schema.columns
//   where table_schema='public' and table_name='profiles';
// into __fixtures__/profiles-columns.json — the failure message says so too.

const KNOWN = new Set(columnsJson as string[]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/** Column tokens in a select string. Relations `x(...)`, aliases and `*` are
 *  skipped — this guard is for PLAIN column names, the 99% case and the one
 *  that actually broke. */
function plainColumns(select: string): string[] {
  // Drop embedded-relation segments wholesale; their inner columns belong to
  // other tables.
  const noRelations = select.replace(/[a-zA-Z_]+\s*\([^)]*\)/g, '');
  return noRelations
    .split(',')
    .map((t) => t.trim())
    .filter((t) => /^[a-z_]+$/.test(t) && t !== '*');
}

describe('every profiles select names only real columns', () => {
  it('matches the schema snapshot', () => {
    const offenders: string[] = [];
    // Tempered: stop if another .from( begins — a profiles UPDATE followed by
    // a different table's select must not attribute that select to profiles.
    const re = /\.from\(\s*['"]profiles['"]\s*\)(?:(?!\.from\()[\s\S]){0,200}?\.select\(\s*(['"`])([\s\S]*?)\1/g;
    for (const file of sourceFiles('src')) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(re)) {
        for (const col of plainColumns(m[2])) {
          if (!KNOWN.has(col)) offenders.push(`${file}: "${col}"`);
        }
      }
    }
    // If this fails after a migration ADDED a column: regenerate the snapshot
    // (see header). If it fails on a column you just typed: that column does
    // not exist, and without this test it would have been a silent 404.
    expect(offenders).toEqual([]);
  });

  it('the snapshot itself is sane', () => {
    expect(KNOWN.size).toBeGreaterThan(100);
    expect(KNOWN.has('id')).toBe(true);
    expect(KNOWN.has('need_check')).toBe(false); // the one that caused this test
  });
});
