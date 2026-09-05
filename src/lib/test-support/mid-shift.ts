import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Pin the clock to the middle of a counsellor's shift for deck tests.
 *
 * The day stops dealing NEW cards once the shift ends (Incident #72), so a
 * test that builds a deck against the wall clock passes all morning and
 * returns an empty deck after 21:00 IST. That is the code telling the truth at
 * an inconvenient moment, not a bug — pin the hour so the assertion is about
 * the queue rather than about when CI happened to run.
 *
 * Only Date is faked; timers and promises are left alone. Only the hour moves —
 * the date stays today, so fixtures built from relative days (signed up three
 * days ago, last logged yesterday) keep meaning what they meant.
 */
export function pinMidShiftClock(): void {
  beforeEach(() => {
    const noonIst = new Date();
    noonIst.setUTCHours(6, 30, 0, 0); // 12:00 IST
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(noonIst);
  });
  afterEach(() => { vi.useRealTimers(); });
}
