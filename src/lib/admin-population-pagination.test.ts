import { describe, it, expect } from 'vitest';
import { getRealStudents } from './admin-filters';

// ── THE 1000-ROW CEILING ────────────────────────────────────────────────────
//
// 2 Sep 2026: the Command Centre showed "Students 1000" at 21:52 and again at
// 02:34 while every other tile moved. There were 1,027 real students. Supabase
// caps every PostgREST response at 1000 rows, the query had no range, and the
// tile rendered `students.length` — so a truncation rendered as a plausible
// round number and sat there looking like a plateau.
//
// It was not only a tile. This list is the base population the Founder Inbox,
// "studied today" and "sales-ready" all filter against, so the 27 students
// past the cap were invisible to every one of those surfaces.
//
// These tests drive a fake query builder that enforces the same 1000-row cap
// the real one does, so a regression to a single unranged `.select()` fails
// here instead of on the founder's phone.

function fakeAdmin(totalRows: number) {
  const all = Array.from({ length: totalRows }, (_, i) => ({
    // Zero-padded so lexicographic order matches numeric order, as a real uuid
    // ordering would be stable.
    id: String(i).padStart(6, '0'),
    full_name: `Student ${i}`, phone: null, onboarding_completed: true,
  }));
  const calls: Array<[number, number]> = [];
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'not', 'order']) {
    builder[m] = () => builder;
  }
  builder.range = (from: number, to: number) => {
    calls.push([from, to]);
    const size = to - from + 1;
    // The real server never returns more than 1000 however large the range.
    const capped = Math.min(size, 1000);
    return Promise.resolve({ data: all.slice(from, from + capped), error: null });
  };
  return { admin: { from: () => builder }, calls };
}

describe('the base population is never silently truncated', () => {
  it('returns all 1,027 students — the exact case that showed as 1000', async () => {
    const { admin } = fakeAdmin(1027);
    const rows = await getRealStudents(admin);
    expect(rows).toHaveLength(1027);
    expect(new Set(rows.map((r) => r.id)).size).toBe(1027); // no duplicates across pages
  });

  it('stops after one request when the population fits in a page', async () => {
    const { admin, calls } = fakeAdmin(640);
    const rows = await getRealStudents(admin);
    expect(rows).toHaveLength(640);
    expect(calls).toHaveLength(1); // a short page ends the loop; no wasted round-trip
  });

  it('handles an exact multiple of the page size without dropping or looping forever', async () => {
    const { admin, calls } = fakeAdmin(2000);
    const rows = await getRealStudents(admin);
    expect(rows).toHaveLength(2000);
    // Two full pages cannot prove the end; a third empty page does.
    expect(calls).toHaveLength(3);
  });

  it('holds at 100,000 — the SCALE-CONTRACT number, not just today\'s', async () => {
    const { admin } = fakeAdmin(100_000);
    const rows = await getRealStudents(admin);
    expect(rows).toHaveLength(100_000);
  });

  it('throws rather than returning a short population when a page fails', async () => {
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'not', 'order']) builder[m] = () => builder;
    builder.range = () => Promise.resolve({ data: null, error: { message: 'timeout' } });
    // A partial population that looks complete is the bug; failing loudly is
    // strictly better than a quietly wrong count.
    await expect(getRealStudents({ from: () => builder })).rejects.toThrow(/timeout/);
  });
});
