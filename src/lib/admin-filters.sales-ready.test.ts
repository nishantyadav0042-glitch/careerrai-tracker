import { describe, it, expect } from 'vitest';
import { getSalesReadyToCall } from './admin-filters';

// ── THE CARD SAID 1,098 WHEN THE ANSWER WAS 675 ─────────────────────────────
//
// Founder, 15 Sep 2026, looking at the Command Center: "are these numbers
// real?" This one was not.
//
// `getSalesReadyToCall` computed the set of students who had ALREADY been
// called — and then returned `rows`, the full sales-ready list, never applying
// it. 1,098 flagged, 423 already spoken to, 675 genuinely uncalled, and the
// card read 1,098. Counsellors were being pointed at students they had already
// worked.
//
// The read underneath it was broken too: one `.in()` over ~1,100 ids against a
// table returning 1,411 matching rows — past the 1,000-row cap (Incident #65)
// and a URL long enough to be refused — with its `error` discarded, so a total
// failure reported everybody as uncalled.

/* eslint-disable @typescript-eslint/no-explicit-any */
function admin(tables: Record<string, any>) {
  const chain = (table: string): any => {
    const c: any = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'lt', 'not', 'order', 'limit', 'range']) c[m] = () => c;
    c.then = (ok: any) => {
      const v = tables[table];
      if (v instanceof Error) return Promise.resolve({ data: null, error: { message: v.message } }).then(ok);
      return Promise.resolve({ data: v ?? [], error: null }).then(ok);
    };
    return c;
  };
  return { from: chain };
}

const students = [
  { id: 'called', full_name: 'Already Called', phone: '9990000001' },
  { id: 'uncalled', full_name: 'Never Called', phone: '9990000002' },
] as any;

const engagement = [
  { student_id: 'called', buddy_cta_clicks: 2, mock_opened: true, signed_up_at: null },
  { student_id: 'uncalled', buddy_cta_clicks: 1, mock_opened: false, signed_up_at: null },
];

describe('the card counts students who have NOT been called', () => {
  it('drops a student who has already been worked', async () => {
    const rows = await getSalesReadyToCall(admin({
      student_engagement: engagement,
      sales_activity: [{ student_id: 'called' }],
      profiles: [], streak_data: [], mentor_grants: [],
    }), students);
    // The whole defect: this used to return BOTH.
    expect(rows.map((r) => r.id)).toEqual(['uncalled']);
  });

  it('keeps everyone when nobody has been called yet', async () => {
    const rows = await getSalesReadyToCall(admin({
      student_engagement: engagement,
      sales_activity: [],
      profiles: [], streak_data: [], mentor_grants: [],
    }), students);
    expect(rows.map((r) => r.id).sort()).toEqual(['called', 'uncalled']);
  });

  it('returns nothing when every flagged student has been called', async () => {
    const rows = await getSalesReadyToCall(admin({
      student_engagement: engagement,
      sales_activity: [{ student_id: 'called' }, { student_id: 'uncalled' }],
      profiles: [], streak_data: [], mentor_grants: [],
    }), students);
    expect(rows).toEqual([]);
  });

  // Returning [] on a failed read is the bug getRealStudents in the same file
  // already documents. A silently-wrong "sales-ready" count sends two
  // counsellors at students they have already spoken to.
  it('throws rather than reporting everybody as uncalled', async () => {
    await expect(getSalesReadyToCall(admin({
      student_engagement: engagement,
      sales_activity: new Error('URI too long'),
      profiles: [], streak_data: [], mentor_grants: [],
    }), students)).rejects.toThrow(/could not read prior contact/);
  });
});
