import { describe, it, expect, vi, beforeEach } from 'vitest';
import { claimBuddyPitch, buddyPitchedToday, settleBuddyPitch } from './promo-impression';

/* eslint-disable @typescript-eslint/no-explicit-any */
const SHOWN = '2026-08-26T14:00:00.000Z';
const adminWith = (error: { code?: string; message: string } | null) => ({
  from: () => ({
    insert: () => ({
      select: () => ({ single: async () => ({ data: error ? null : { shown_at: SHOWN }, error }) }),
    }),
  }),
}) as any;

describe('the one-pitch-a-day claim', () => {
  it('an unclaimed day → show', async () => {
    expect(await claimBuddyPitch(adminWith(null), 's1', 'modal'))
      .toEqual({ show: true, shownAt: SHOWN });
  });

  it('an already-claimed day → do not show, and say why', async () => {
    expect(await claimBuddyPitch(adminWith({ code: '23505', message: 'dup' }), 's1', 'notification'))
      .toEqual({ show: false, reason: 'already_pitched_today' });
  });

  it('FAILS CLOSED: any unknown failure means no pitch', async () => {
    // The old localStorage throttle returned TRUE on failure — a blocked
    // storage jar meant a pitch on every open. This is the inversion that
    // makes the founder's rule hold: no proof the day is unpitched, no pitch.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await claimBuddyPitch(adminWith({ message: 'connection reset' }), 's1', 'modal'))
      .toEqual({ show: false, reason: 'claim_failed' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('the read-only pitched-today check (inline surfaces)', () => {
  const adminReading = (data: unknown, error: { message: string } | null = null) => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }) }) }),
    }),
  }) as any;

  it('no row today → the inline card may render', async () => {
    expect(await buddyPitchedToday(adminReading(null), 's1')).toBe(false);
  });

  it('a row today → the card goes quiet', async () => {
    expect(await buddyPitchedToday(adminReading({ student_id: 's1' }), 's1')).toBe(true);
  });

  it('FAILS CLOSED: an unreadable answer hides the promo, never stacks it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await buddyPitchedToday(adminReading(null, { message: 'down' }), 's1')).toBe(true);
    spy.mockRestore();
  });

  it('it READS, it never claims — no insert exists on its path', async () => {
    // A check that consumed the slot would burn the modal's pitch every time
    // a student merely opened the tracker. The fake above has no insert; if
    // the implementation ever calls one, this test throws on the missing stub.
    await buddyPitchedToday(adminReading(null), 's1');
  });
});


// ── D1: a send that never landed must hand the day back ─────────────────────
//
// Audit 26 Aug measured it in production: the evening cron claimed 150 days
// and delivered 136. Fourteen students were recorded as pitched and received
// nothing — no push, no in-app row, no pitch from any other surface for the
// rest of that study day.
//
// The trap these tests exist to hold shut: dispatch() returns 'failed' BOTH
// when no notification row was ever written AND when the row exists but the
// push transport died. In the second case the student has an in-app
// notification in their bell — they WERE pitched — so releasing on the enum
// alone would hand out a second pitch and break the founder's one rule.
describe('settling a claim after the send was attempted', () => {
  const deleted: Array<Record<string, unknown>> = [];
  const admin = (notificationRows: unknown[], opts: {
    readError?: { message: string };
    deleteError?: { message: string };
  } = {}) => ({
    from: (table: string) => {
      if (table === 'notifications') {
        const q: any = {
          select: () => q, eq: () => q,
          gte: () => q,
          limit: async () => ({ data: opts.readError ? null : notificationRows, error: opts.readError ?? null }),
        };
        return q;
      }
      const d: any = {
        delete: () => d,
        _f: {} as Record<string, unknown>,
        eq(col: string, val: unknown) { d._f[col] = val; return d; },
        then(res: (v: unknown) => unknown) {
          if (!opts.deleteError) deleted.push({ ...d._f });
          return Promise.resolve({ error: opts.deleteError ?? null }).then(res);
        },
      };
      return d;
    },
  }) as any;

  beforeEach(() => { deleted.length = 0; });

  it('delivered → the claim stands', async () => {
    expect(await settleBuddyPitch(admin([]), 's1', 'buddy_evening', { shownAt: SHOWN }, 'sent'))
      .toBe('kept');
    expect(deleted).toHaveLength(0);
  });

  it('budget exhausted, nothing written → the day goes back', async () => {
    expect(await settleBuddyPitch(admin([]), 's1', 'buddy_evening', { shownAt: SHOWN }, 'budget_exhausted'))
      .toBe('released');
  });

  it('THE TRAP: push transport failed but the in-app row exists → the claim stands', async () => {
    // Releasing here would give this student a SECOND pitch today, because
    // they can already read the first one in their notification bell.
    expect(await settleBuddyPitch(admin([{ id: 'n1' }]), 's1', 'buddy_evening', { shownAt: SHOWN }, 'failed'))
      .toBe('kept');
    expect(deleted).toHaveLength(0);
  });

  it('insert failed outright, no row anywhere → the day goes back', async () => {
    expect(await settleBuddyPitch(admin([]), 's1', 'buddy_evening', { shownAt: SHOWN }, 'failed'))
      .toBe('released');
  });

  it('duplicate suppressed → the claim stands (a pitch already exists today)', async () => {
    expect(await settleBuddyPitch(admin([]), 's1', 'buddy_evening', { shownAt: SHOWN }, 'duplicate_suppressed'))
      .toBe('kept');
    expect(deleted).toHaveLength(0);
  });

  it('a release deletes ONLY the row this claim created', async () => {
    await settleBuddyPitch(admin([]), 's1', 'buddy_evening', { shownAt: SHOWN }, 'failed');
    expect(deleted).toEqual([{ student_id: 's1', promo_type: 'buddy_pitch', shown_at: SHOWN }]);
  });

  it('FAILS SAFE: an unreadable delivery check keeps the claim', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await settleBuddyPitch(admin([], { readError: { message: 'down' } }), 's1', 'buddy_evening', { shownAt: SHOWN }, 'failed'))
      .toBe('kept');
    expect(deleted).toHaveLength(0);
    spy.mockRestore();
  });

  it('FAILS SAFE: a delete that errors leaves the day claimed, never half-released', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await settleBuddyPitch(admin([], { deleteError: { message: 'conflict' } }), 's1', 'buddy_evening', { shownAt: SHOWN }, 'failed'))
      .toBe('kept');
    spy.mockRestore();
  });
});
