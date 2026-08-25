import { describe, it, expect, vi } from 'vitest';
import { claimBuddyPitch } from './promo-impression';

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
