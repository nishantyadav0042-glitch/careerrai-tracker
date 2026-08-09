import { describe, it, expect } from 'vitest';
import { buddyHeat, buddyReason, DWELL_CAP_SEC, type BuddySignals } from './buddy-interest';

const base: BuddySignals = { opens: 0, dwellSec: 0, unlockOpens: 0, planClicks: 0, reachedCheckout: false };

describe('buddy heat ranks real buy-intent', () => {
  it('reaching checkout is the strongest single signal', () => {
    expect(buddyHeat({ ...base, reachedCheckout: true })).toBe(50);
  });
  it('explicit taps beat passive dwell', () => {
    const taps = buddyHeat({ ...base, planClicks: 2, unlockOpens: 1 });   // 24 + 8 = 32
    const dwell = buddyHeat({ ...base, dwellSec: 300 });                   // 10
    expect(taps).toBeGreaterThan(dwell);
  });
  it('only repeat opens score — a single passing visit does not', () => {
    expect(buddyHeat({ ...base, opens: 1 })).toBe(0);
    expect(buddyHeat({ ...base, opens: 4 })).toBe(6); // (4-1)*2
  });
  it('every term is capped so one signal cannot dominate', () => {
    const maxed = buddyHeat({ opens: 999, dwellSec: 999999, unlockOpens: 99, planClicks: 99, reachedCheckout: true });
    expect(maxed).toBe(50 + 36 + 24 + 20 + 20);
  });
  it('the reason names the actual signals, hottest first', () => {
    const r = buddyReason({ ...base, reachedCheckout: true, planClicks: 1, opens: 3, dwellSec: 120 });
    expect(r).toContain('reached checkout');
    expect(r).toContain('1 plan tap');
    expect(r).toContain('opened 3×');
    expect(r).toContain('2 min on screen');
  });
  it('dwell cap is a sane 30 minutes (a left-open tab is not reading)', () => {
    expect(DWELL_CAP_SEC).toBe(1800);
  });
});
