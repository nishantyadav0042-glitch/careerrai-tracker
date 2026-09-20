import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE } from '@/lib/truth/batch';
import { getRepPortfolio } from '@/lib/sales-portfolio';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── MY LEADS FORGOT EVERY NAME TOO ──────────────────────────────────────────
//
// Anshul, 20 Sep 2026: "My Leads: All entries are showing as generic 'Student'
// instead of individual names. I have to open each profile to see the
// student's name and last update."
//
// The SAME defect as the calling list, in a second file, reported the day
// after the first was fixed. `getRepPortfolio` passed the rep's whole book —
// 1,140 ids, roughly 42KB of URL — to one `.in()`, twice: once for profiles
// and once for payments. Neither error was inspected, so both came back empty
// and every row fell through to `?? 'Student'`.
//
// The 19 Sep fix said the remaining unchunked call sites were "none on the
// counsellor workspace". That was wrong. This test exists so the third
// occurrence cannot be discovered by a counsellor again.
//
// THE PAYMENTS HALF IS WORSE AND WAS NOT REPORTED, because it is invisible:
// when it fails, `paid` is false for everyone, the Won filter empties, and
// SA-1E's rule that a paying student leaves active work silently stops
// holding — so somebody who has already paid keeps being called as a lead.

/** Records every id list that reaches `.in()`, so request size is observable. */
function fakeAdmin(bookSize: number, opts: { failProfiles?: boolean; failPaid?: boolean } = {}) {
  const inCalls: { table: string; ids: string[] }[] = [];
  const book = Array.from({ length: bookSize }, (_, i) => ({
    student_id: `s-${i}`, status: 'interested', callback_at: null,
    notes: null, updated_at: '2026-09-19T00:00:00.000Z',
  }));
  const admin = {
    from(table: string) {
      const q: any = {
        select: () => q,
        // lead_outreach is read with .eq('owner_id') and awaited directly.
        eq: () => (table === 'lead_outreach' ? Promise.resolve({ data: book, error: null }) : q),
        // sales_activity filters actor_id with .not() before .in().
        not: () => q,
        in: (_col: string, ids: string[]) => {
          inCalls.push({ table, ids });
          const result =
            table === 'profiles'
              ? (opts.failProfiles
                ? { data: null, error: { message: 'URL too long' } }
                : { data: ids.map((id) => ({ id, full_name: `Name ${id}`, phone: `+9199${id}` })), error: null })
              : table === 'student_payments'
                ? (opts.failPaid
                  ? { data: null, error: { message: 'URL too long' } }
                  : { data: ids.map((id) => ({ student_id: id, amount: 39900 })), error: null })
                : { data: [], error: null };
          const chain: any = {
            order: () => chain,
            limit: () => Promise.resolve(result),
            then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
          };
          return chain;
        },
      };
      return q;
    },
  };
  return { admin, inCalls };
}

describe('no request carries the whole book', () => {
  it('splits every .in() at Anshul\'s real volume', async () => {
    const { admin, inCalls } = fakeAdmin(1140);

    await getRepPortfolio(admin, 'rep-1');

    for (const table of ['profiles', 'student_payments']) {
      const calls = inCalls.filter((c) => c.table === table);
      expect(calls.length, `${table} must be split across requests`).toBeGreaterThan(1);
      for (const c of calls) {
        expect(c.ids.length,
          `a ${table} request carried ${c.ids.length} ids — that is the 42KB URL that emptied his book`)
          .toBeLessThanOrEqual(CHUNK_SIZE);
      }
    }
  });

  it('resolves a real name on every row', async () => {
    const { admin } = fakeAdmin(1140);
    const { leads, bookReadable } = await getRepPortfolio(admin, 'rep-1');
    expect(bookReadable).toBe(true);
    expect(leads.length).toBe(1140);
    expect(leads.filter((l) => l.name === 'Student').length,
      'every lead must carry the student\'s real name').toBe(0);
  });

  it('still resolves the paid ledger at volume', async () => {
    // The half nobody reported. If this read silently returns nothing, a
    // paying student stays in the Active filter and keeps getting called.
    const { admin } = fakeAdmin(1140);
    const { leads, summary } = await getRepPortfolio(admin, 'rep-1');
    expect(leads.every((l) => l.paid)).toBe(true);
    expect(summary.converted).toBe(1140);
    expect(summary.booked).toBeGreaterThan(0);
  });
});

describe('a broken lookup is reported, never disguised', () => {
  it('flags the book unreadable when the profile read fails', async () => {
    const { admin } = fakeAdmin(1140, { failProfiles: true });
    const { leads, bookReadable } = await getRepPortfolio(admin, 'rep-1');
    expect(bookReadable, 'a book of students called "Student" must announce itself').toBe(false);
    expect(leads.every((l) => l.name === 'Student')).toBe(true);
  });

  it('flags the book unreadable when the PAYMENTS read fails', async () => {
    // Names look perfect here — this is the failure a counsellor cannot see,
    // and the reason the flag covers both reads rather than names alone.
    const { admin } = fakeAdmin(1140, { failPaid: true });
    const { leads, bookReadable, summary } = await getRepPortfolio(admin, 'rep-1');
    expect(bookReadable).toBe(false);
    expect(leads.every((l) => l.name !== 'Student')).toBe(true);
    expect(summary.converted).toBe(0);
  });

  it('reports a readable book when nothing failed', async () => {
    const { admin } = fakeAdmin(250);
    expect((await getRepPortfolio(admin, 'rep-1')).bookReadable).toBe(true);
  });

  it('an empty book is readable, not broken', async () => {
    const { admin } = fakeAdmin(0);
    const { leads, bookReadable } = await getRepPortfolio(admin, 'rep-1');
    expect(leads).toEqual([]);
    expect(bookReadable).toBe(true);
  });
});
