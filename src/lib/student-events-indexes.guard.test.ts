import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';

// ── AN INDEX IS EARNED BY A WHERE CLAUSE ────────────────────────────────────
//
// Migration 20260922b dropped ONE index on `student_events` —
// `idx_student_events_anon` (anon_id, created_at DESC), 30.4 MB and the
// largest in the database, 6% of the whole 500 MB plan — because nothing in
// this repository filters, joins or orders on that column.
//
// The grep that justified it was true on 22 Sep 2026 and is worth nothing a
// month later, so it lives here rather than in a commit message: the day
// someone writes the query, this fails and says to recreate the index instead
// of letting it scan 151,677 rows and blaming the database.
//
// SELECTING a column is not reading an index. `admin/buddy-funnel` selects
// `anon_id` and filters on `event` — that is what `idx_student_events_event`
// is for. Only a filter, a join or an order can use one.
//
// `idx_student_events_mode` was proposed for the same drop on the same
// reasoning and KEPT: measured on production, its one reader runs 73 ms with
// it and 107 ms without. The last test in this file is the reason that
// near-miss cannot repeat — a scan COUNT says how often an index is chosen,
// never what dropping it costs.

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const SOURCES: [string, string][] = walk(SRC).map((p) => [p, codeOnly(readFileSync(p, 'utf8'))]);

/** A file that queries student_events at all. Inserts are not reads. */
const QUERIES_STUDENT_EVENTS = SOURCES.filter(([, code]) =>
  /from\(\s*['"]student_events['"]\s*\)/.test(code));

/** `.eq('col'`, `.in('col'`, `.gt('col'`, `.order('col'`, … — the shapes that use an index. */
const usesColumn = (code: string, col: string) =>
  new RegExp(`\\.(eq|neq|in|gt|gte|lt|lte|like|ilike|is|not|order|match|filter|contains)\\(\\s*['"]${col}['"]`)
    .test(code);

describe('the dropped student_events indexes have not acquired a reader', () => {
  it('nothing filters, joins or orders student_events by anon_id', () => {
    const offenders = QUERIES_STUDENT_EVENTS
      .filter(([, code]) => usesColumn(code, 'anon_id'))
      .map(([p]) => p);
    expect(
      offenders,
      'idx_student_events_anon was dropped (30.4 MB, migration 20260922b). ' +
      'Something now filters student_events on anon_id, so recreate the index in a new ' +
      'migration — the CREATE is in 20260715_student_events_tracking.sql — or change the query.',
    ).toEqual([]);
  });

  it('the four indexes we kept still have the readers that earned them', () => {
    // The counterweight: this file must never read as "student_events needs no
    // indexes". These three columns carry 890,421 + 410,382 + 16,320 scans
    // between them, and a migration dropping one of them should fail here.
    const all = SOURCES.map(([, c]) => c).join('\n');
    for (const col of ['user_id', 'created_at', 'event']) {
      expect(usesColumn(all, col), `nothing filters on ${col} — verify before dropping its index`).toBe(true);
    }
  });

  it('the migration drops exactly one index, and not the one we verified was earning its keep', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260922b_one_index_nothing_reads.sql'), 'utf8');
    const dropped = [...sql.matchAll(/^\s*drop\s+index\s+if\s+exists\s+public\.(\w+)/gim)].map((m) => m[1]);
    expect(dropped).toEqual(['idx_student_events_anon']);
    expect(sql, 'a DROP TABLE has no business in an index migration').not.toMatch(/drop\s+table/i);
  });

  it('records the measurement that saved idx_student_events_mode, not just the verdict', () => {
    // The near-miss is the reusable part. A future reader who sees "59 scans"
    // and reaches for the drop must find the 73ms-vs-107ms number in the same
    // file, or this whole episode teaches nothing.
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260922b_one_index_nothing_reads.sql'), 'utf8');
    expect(sql).toMatch(/idx_student_events_mode/);
    expect(sql, 'the migration must carry the measured before/after, not an assertion').toMatch(/73 ms/);
    expect(sql).toMatch(/107 ms/);
  });
});
