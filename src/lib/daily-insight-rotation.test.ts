import { describe, it, expect } from 'vitest';
import { loadSuppressedInsightKeys, INSIGHT_SUPPRESS_DAYS } from './daily-insight';

// ── The insight rotates once per DAY, not once per page load ───────────────
//
// Production defect (forensic audit, 27 Aug): the founder saw the identical
// "23 topics done / 23 to go" card for several consecutive mornings.
//
// It was not frozen state. The suppression read had no upper bound, so the
// row written by today's show satisfied `last_shown_on > cutoff` and today's
// own insight suppressed itself. The Home page records a show on EVERY server
// render, so each visit re-ran the decision against a set that had just grown:
// four or five visits in one day drained a candidate pool of one to three
// items, and what remained was the suppression-exempt `progress` fallback,
// whose numbers come from topic_coverage and do not move for days.
//
// These tests pin the boundary. The fake records the filters the query
// actually applied, because that — not the returned rows — is where the bug
// lived.

const IST_TODAY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

function adminSpy(rows: Array<{ insight_key: string; last_shown_on: string }>) {
  const filters: Array<{ op: string; col: string; val: unknown }> = [];
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (col: string, val: unknown) => { filters.push({ op: 'eq', col, val }); return q; },
    gt: (col: string, val: unknown) => { filters.push({ op: 'gt', col, val }); return q; },
    lt: (col: string, val: unknown) => { filters.push({ op: 'lt', col, val }); return q; },
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
  };
  return { admin: { from: () => q }, filters };
}

describe('insight suppression window', () => {
  it("excludes TODAY — today's own show must never suppress today's insight", async () => {
    const { admin, filters } = adminSpy([]);
    await loadSuppressedInsightKeys(admin as never, 'stu-1');

    const upper = filters.find((f) => f.op === 'lt' && f.col === 'last_shown_on');
    expect(
      upper,
      'The suppression read has no upper bound. Today\'s own row then suppresses today\'s insight, and because Home records a show on every render, each page load burns another candidate until only the exempt `progress` fallback is left.',
    ).toBeTruthy();
    expect(upper!.val).toBe(IST_TODAY());
  });

  it('still excludes the last 7 days', async () => {
    const { admin, filters } = adminSpy([]);
    await loadSuppressedInsightKeys(admin as never, 'stu-1');
    const lower = filters.find((f) => f.op === 'gt' && f.col === 'last_shown_on');
    expect(lower).toBeTruthy();
    const expected = new Date(Date.now() - INSIGHT_SUPPRESS_DAYS * 86_400_000)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    expect(lower!.val).toBe(expected);
  });

  it('is scoped to one student', async () => {
    const { admin, filters } = adminSpy([]);
    await loadSuppressedInsightKeys(admin as never, 'stu-1');
    expect(filters.some((f) => f.op === 'eq' && f.col === 'student_id' && f.val === 'stu-1')).toBe(true);
  });

  it('the window is STABLE within a day — repeated loads see the same set', async () => {
    // This is the property that makes the card stop changing on every visit:
    // same filters in, same suppressed set out, so the same rule fires and the
    // student sees one insight all day.
    const rows = [{ insight_key: 'consistency:', last_shown_on: '2026-08-20' }];
    const a = adminSpy(rows); const b = adminSpy(rows);
    const first = await loadSuppressedInsightKeys(a.admin as never, 'stu-1');
    const second = await loadSuppressedInsightKeys(b.admin as never, 'stu-1');
    expect([...first]).toEqual([...second]);
    expect(a.filters).toEqual(b.filters);
  });

  it('returns the keys it was given', async () => {
    const { admin } = adminSpy([
      { insight_key: 'avoidance:DILR', last_shown_on: '2026-08-25' },
      { insight_key: 'revision:Algebra', last_shown_on: '2026-08-24' },
    ]);
    const set = await loadSuppressedInsightKeys(admin as never, 'stu-1');
    expect(set.has('avoidance:DILR')).toBe(true);
    expect(set.has('revision:Algebra')).toBe(true);
    expect(set.size).toBe(2);
  });
});
