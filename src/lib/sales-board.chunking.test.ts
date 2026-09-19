import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CHUNK_SIZE } from '@/lib/truth/batch';
import type { OpenFollowup } from '@/lib/sales-followup';

// The query-builder double below is a chainable stub whose methods return
// itself, which has no honest static type. Same convention, and the same
// disable, as sales-pages.render.test.tsx and sales-board.ts itself.
/* eslint-disable @typescript-eslint/no-explicit-any */

// ── THE CALLING LIST THAT FORGOT EVERY NAME ─────────────────────────────────
//
// Anshul, 19 Sep 2026: "all students are showing as 'Student' in the calling
// list, so I have to open each profile individually to see the actual details."
//
// Every one of the 332 open follow-ups had a real `full_name` in the database.
// Nothing was null and nothing errored. The board collected one id list —
// 140 promises plus 1,011 open leads, 1,013 distinct — and put all of them in
// a single `.in('id', ids)`, which puts all of them in the REQUEST URL: about
// 37KB. The request failed, `profs` came back empty, the map was empty, and
// every row rendered the `?? 'Student'` placeholder.
//
// This is the 23 Aug incident exactly, described in lib/truth/batch's own
// header at 656 ids and ~24KB. Neelam never saw it because she owns 186 ids,
// roughly 7KB — under the limit. It appeared the day Anshul's book crossed it.
//
// Grepping for `chunkIds` would prove nothing about request size, so this
// test counts the ids that actually reach the client.

const followups = vi.hoisted(() => ({ rows: [] as OpenFollowup[] }));
const cfg = vi.hoisted(() => ({
  repId: 'rep-1', active: true, employmentType: 'full_time' as const,
  workDays: [1, 2, 3, 4, 5, 6, 7], workStartIst: '00:00', workEndIst: '23:59',
  maxCapacityUnits: 999, maxNewPerDay: 99, firstContactSlaMinutes: 60,
  unavailableUntil: null, capacityOverride: null, overrideUntil: null,
}));

vi.mock('@/lib/sales-followup', async (orig) => ({
  ...(await orig<typeof import('@/lib/sales-followup')>()),
  listOpenFollowups: async () => followups.rows,
}));
vi.mock('@/lib/sales-capacity', () => ({
  readRepConfigs: async () => new Map([['rep-1', cfg]]),
}));

import { getRepFollowupBoard } from '@/lib/sales-board';

/** Records every id list that reaches `.in()`, so request size is observable. */
function fakeAdmin(leadCount: number, opts: { failProfiles?: boolean } = {}) {
  const inCalls: { table: string; ids: string[] }[] = [];
  const leads = Array.from({ length: leadCount }, (_, i) => ({
    student_id: `lead-${i}`, assigned_at: '2026-09-01T00:00:00.000Z',
    first_contact_at: null, status: 'new',
  }));
  const admin = {
    from(table: string) {
      const q: any = {
        select: () => q,
        eq: () => q,
        not: () => Promise.resolve({ data: leads, error: null }),
        in: (_col: string, ids: string[]) => {
          inCalls.push({ table, ids });
          if (table === 'profiles' && opts.failProfiles) {
            return Promise.resolve({ data: null, error: { message: 'URL too long' } });
          }
          return Promise.resolve({
            data: ids.map((id) => ({ id, full_name: `Name ${id}`, phone: `+9199${id}` })),
            error: null,
          });
        },
      };
      return q;
    },
  };
  return { admin, inCalls };
}

beforeEach(() => { followups.rows = []; });

describe('no request carries the whole book', () => {
  it('never puts more than CHUNK_SIZE ids in one profiles request', async () => {
    followups.rows = Array.from({ length: 140 }, (_, i) => ({
      id: i, studentId: `lead-${i}`, ownerId: 'rep-1',
      dueAt: '2026-09-19T12:00:00.000Z', reason: "Cadence after 'no_answer'",
      channel: 'phone', createdAt: '2026-09-18T00:00:00.000Z',
    }));
    const { admin, inCalls } = fakeAdmin(1011);

    await getRepFollowupBoard(admin, 'rep-1', Date.parse('2026-09-19T18:00:00.000Z'));

    const profileCalls = inCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls.length, 'the read must be split across requests').toBeGreaterThan(1);
    for (const c of profileCalls) {
      expect(c.ids.length,
        `a request carried ${c.ids.length} ids — that is the 37KB URL that broke Anshul's list`)
        .toBeLessThanOrEqual(CHUNK_SIZE);
    }
  });

  it('resolves the real name on every row at Anshul\'s volume', async () => {
    followups.rows = Array.from({ length: 140 }, (_, i) => ({
      id: i, studentId: `lead-${i}`, ownerId: 'rep-1',
      dueAt: '2026-09-19T12:00:00.000Z', reason: "Cadence after 'no_answer'",
      channel: 'phone', createdAt: '2026-09-18T00:00:00.000Z',
    }));
    const { admin } = fakeAdmin(1011);

    const board = await getRepFollowupBoard(admin, 'rep-1', Date.parse('2026-09-19T18:00:00.000Z'));

    expect(board.namesReadable).toBe(true);
    expect(board.promises).not.toBeNull();
    const unnamed = (board.promises ?? []).filter((p) => p.name == null);
    expect(unnamed.length, 'every promise must carry the student\'s real name').toBe(0);
    expect((board.promises ?? [])[0].phone, 'the number must reach the row').toMatch(/^\+9199/);
  });

  it('does not fetch a name for a lead that will never be rendered', async () => {
    // The SLA filter runs first. A counsellor owning 1,011 leads must not
    // trigger 1,011 ids of lookup when only the waiting ones reach a screen.
    followups.rows = [];
    const { admin, inCalls } = fakeAdmin(0);
    await getRepFollowupBoard(admin, 'rep-1', Date.now());
    expect(inCalls.filter((c) => c.table === 'profiles')).toHaveLength(0);
  });
});

describe('a broken lookup is reported, never disguised as "Student"', () => {
  it('flags namesReadable=false when a chunk fails', async () => {
    followups.rows = [{
      id: 1, studentId: 'lead-1', ownerId: 'rep-1', dueAt: '2026-09-19T12:00:00.000Z',
      reason: 'x', channel: 'phone', createdAt: '2026-09-18T00:00:00.000Z',
    }];
    const { admin } = fakeAdmin(5, { failProfiles: true });

    const board = await getRepFollowupBoard(admin, 'rep-1', Date.now());

    expect(board.namesReadable,
      'a failed name read must be visible — otherwise the screen says "Student" and looks fine')
      .toBe(false);
    // The promises themselves still load: the times are real even when the
    // names are not, and hiding them would lose the follow-up entirely.
    expect(board.promises).not.toBeNull();
  });
});
