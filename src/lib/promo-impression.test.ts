import { describe, it, expect, vi } from 'vitest';
import { claimBuddyPitch, buddyPitchedToday } from './promo-impression';

/* eslint-disable @typescript-eslint/no-explicit-any */
const adminWith = (error: { code?: string; message: string } | null) => ({
  from: () => ({ insert: async () => ({ error }) }),
}) as any;

describe('the one-pitch-a-day claim', () => {
  it('an unclaimed day → show', async () => {
    expect(await claimBuddyPitch(adminWith(null), 's1', 'modal')).toEqual({ show: true });
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
