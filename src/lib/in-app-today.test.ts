/**
 * The evening push now stands down for a student who is already inside the
 * app today (NOTIFICATION-OS §10b.1). That makes this read a gate on reach:
 * every failure mode of it either silences a student who should have been
 * reached, or reaches one who should have been left alone.
 */
import { describe, it, expect } from 'vitest';
import { studentsInsideAppSince } from './in-app-today';

type Page = { data: { user_id: string }[] | null; error: { message: string } | null };

/** Minimal PostgREST stand-in: records the filters, serves canned pages. */
function fakeAdmin(pagesFor: (ids: string[]) => Page[]) {
  const calls: { ids: string[]; event: string; since: string }[] = [];
  const admin = {
    from() {
      let ids: string[] = [];
      let event = '';
      let since = '';
      const q = {
        select: () => q,
        eq: (_c: string, v: string) => { event = v; return q; },
        gte: (_c: string, v: string) => { since = v; return q; },
        in: (_c: string, v: string[]) => { ids = v; return q; },
        order: () => q,
        range: (from: number) => {
          if (from === 0) calls.push({ ids, event, since });
          const pages = pagesFor(ids);
          return Promise.resolve(pages[from / 1000] ?? { data: [], error: null });
        },
      };
      return q;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, calls };
}

const SINCE = '2026-09-15T00:00:00+05:30';

describe('studentsInsideAppSince', () => {
  it('returns the students who opened the app, and only those', async () => {
    const { admin, calls } = fakeAdmin(() => [{ data: [{ user_id: 'a' }, { user_id: 'c' }], error: null }]);
    const inside = await studentsInsideAppSince(admin, ['a', 'b', 'c'], SINCE);
    expect([...inside].sort()).toEqual(['a', 'c']);
    expect(calls[0].event, 'app_open is the signal, not "any event"').toBe('app_open');
    expect(calls[0].since).toBe(SINCE);
  });

  it('asks about every student, not the first 200', async () => {
    // `.in()` with a long list does not fail gracefully, so the read is
    // chunked — and a chunk that goes missing reads as "did not open", which
    // would push the students it dropped.
    const ids = Array.from({ length: 450 }, (_, i) => `s${i}`);
    const { admin, calls } = fakeAdmin((chunk) => [{ data: chunk.map((user_id) => ({ user_id })), error: null }]);
    const inside = await studentsInsideAppSince(admin, ids, SINCE);
    expect(calls.length).toBe(3);
    expect(inside.size).toBe(450);
  });

  it('pages instead of stopping at the PostgREST cap (Incident #65)', async () => {
    // student_events is a 237k-row table. A capped read here reports almost
    // nobody as inside the app — the wrong answer in the wrong direction.
    const full = Array.from({ length: 1000 }, (_, i) => ({ user_id: `p${i}` }));
    const { admin } = fakeAdmin(() => [
      { data: full, error: null },
      { data: [{ user_id: 'tail' }], error: null },
    ]);
    const inside = await studentsInsideAppSince(admin, ['x'], SINCE);
    expect(inside.size).toBe(1001);
    expect(inside.has('tail')).toBe(true);
  });

  it('throws rather than reporting a failed read as an empty set', async () => {
    // An empty set means "nobody is inside the app". A caller that cannot tell
    // that from "we could not look" acts on the failure as if it were a fact.
    const { admin } = fakeAdmin(() => [{ data: null, error: { message: 'boom' } }]);
    await expect(studentsInsideAppSince(admin, ['a'], SINCE)).rejects.toThrow(/app_open read failed/);
  });

  it('does not query at all for an empty roster', async () => {
    const { admin, calls } = fakeAdmin(() => [{ data: [], error: null }]);
    expect((await studentsInsideAppSince(admin, [], SINCE)).size).toBe(0);
    expect(calls.length).toBe(0);
  });
});
