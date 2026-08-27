import { describe, it, expect } from 'vitest';
import {
  resolveDeliveryState, needsUnknownStamp, summariseDelivery,
  CONFIRMATION_WINDOW_MS, type DeliveryRow,
} from './delivery-state';

// Every notification must end in a state we can name. These pin the rules that
// make UNKNOWN honest rather than convenient — above all that proof of arrival
// outranks whatever send_status happens to say, because /api/push/received and
// /api/push/click stamp their timestamps and never touch send_status.

const NOW = Date.parse('2026-08-27T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 3_600_000;

const row = (o: Partial<DeliveryRow>): DeliveryRow => ({
  pushed_at: null, received_at: null, clicked_at: null, failed_at: null, ...o,
});

describe('resolveDeliveryState — proof of arrival outranks everything', () => {
  it('a receipt means confirmed', () => {
    expect(resolveDeliveryState(row({ pushed_at: ago(HOUR), received_at: ago(1) }), NOW))
      .toBe('confirmed');
  });

  it('a TAP means confirmed even with no receipt', () => {
    // metric-registry: 22 of 43 taps had no received_at. Requiring a receipt
    // would under-count delivery and make the click rate incoherent.
    expect(resolveDeliveryState(row({ pushed_at: ago(HOUR), clicked_at: ago(1) }), NOW))
      .toBe('confirmed');
  });

  it('a receipt arriving AFTER the window still reads as confirmed', () => {
    // This is what makes the UNKNOWN stamp safe: it is reversible by evidence.
    expect(resolveDeliveryState(
      row({ pushed_at: ago(72 * HOUR), received_at: ago(1) }), NOW,
    )).toBe('confirmed');
  });

  it('arrival beats a recorded failure — a device that displayed it received it', () => {
    expect(resolveDeliveryState(
      row({ pushed_at: ago(HOUR), failed_at: ago(HOUR), received_at: ago(1) }), NOW,
    )).toBe('confirmed');
  });
});

describe('resolveDeliveryState — the states that are not confirmed', () => {
  it('a refused push is failed', () => {
    expect(resolveDeliveryState(row({ pushed_at: ago(HOUR), failed_at: ago(HOUR) }), NOW))
      .toBe('failed');
  });

  it('no push attempted is in_app_only, NOT an unconfirmed send', () => {
    // 15,583 rows in 7 days. Counting these as unconfirmed would invent a
    // delivery problem out of notifications that owed no delivery.
    expect(resolveDeliveryState(row({}), NOW)).toBe('in_app_only');
  });

  it('inside the window it is still pending, not unknown', () => {
    expect(resolveDeliveryState(row({ pushed_at: ago(CONFIRMATION_WINDOW_MS - HOUR) }), NOW))
      .toBe('accepted_pending');
  });

  it('past the window with no proof either way is unknown', () => {
    expect(resolveDeliveryState(row({ pushed_at: ago(CONFIRMATION_WINDOW_MS + HOUR) }), NOW))
      .toBe('unknown');
  });

  it('the boundary itself resolves to unknown', () => {
    expect(resolveDeliveryState(row({ pushed_at: ago(CONFIRMATION_WINDOW_MS) }), NOW))
      .toBe('unknown');
  });

  it('the window is wider than the slowest confirmation ever observed (28.2h)', () => {
    // Production p99 = 9.8h, max = 28.2h. A 24h window would have called real
    // late confirmations UNKNOWN.
    expect(CONFIRMATION_WINDOW_MS).toBeGreaterThan(29 * HOUR);
  });

  it('an unparseable timestamp is treated as no push, never as unknown', () => {
    expect(resolveDeliveryState(row({ pushed_at: 'not-a-date' }), NOW)).toBe('in_app_only');
  });
});

describe('needsUnknownStamp — the sweep only touches settled limbo', () => {
  const stale = { ...row({ pushed_at: ago(CONFIRMATION_WINDOW_MS + HOUR) }), send_status: 'provider_accepted' };

  it('stamps a row past the window still claiming provider_accepted', () => {
    expect(needsUnknownStamp(stale, NOW)).toBe(true);
  });

  it('does NOT stamp a row still inside the window', () => {
    expect(needsUnknownStamp(
      { ...row({ pushed_at: ago(HOUR) }), send_status: 'provider_accepted' }, NOW,
    )).toBe(false);
  });

  it('does NOT stamp a row that was confirmed', () => {
    expect(needsUnknownStamp({ ...stale, received_at: ago(1) }, NOW)).toBe(false);
  });

  it('does NOT stamp a row confirmed only by a tap', () => {
    expect(needsUnknownStamp({ ...stale, clicked_at: ago(1) }, NOW)).toBe(false);
  });

  it('is idempotent — an already-stamped row is not swept again', () => {
    expect(needsUnknownStamp({ ...stale, send_status: 'unknown' }, NOW)).toBe(false);
  });

  it('never touches a failed row', () => {
    expect(needsUnknownStamp({ ...stale, send_status: 'failed' }, NOW)).toBe(false);
  });

  it('never touches an in-app-only row, however old', () => {
    expect(needsUnknownStamp(
      { ...row({}), send_status: 'created' }, NOW,
    )).toBe(false);
  });
});

describe('summariseDelivery — the funnel adds up', () => {
  it('classifies a mixed set without losing or double-counting a row', () => {
    const rows = [
      row({}),                                                        // in_app_only
      row({}),                                                        // in_app_only
      row({ pushed_at: ago(HOUR) }),                                  // accepted_pending
      row({ pushed_at: ago(HOUR), received_at: ago(1) }),             // confirmed
      row({ pushed_at: ago(HOUR), clicked_at: ago(1) }),              // confirmed
      row({ pushed_at: ago(CONFIRMATION_WINDOW_MS + HOUR) }),         // unknown
      row({ pushed_at: ago(HOUR), failed_at: ago(HOUR) }),            // failed
    ];
    const s = summariseDelivery(rows, NOW);
    expect(s).toEqual({
      in_app_only: 2, accepted_pending: 1, confirmed: 2, unknown: 1, failed: 1,
    });
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(rows.length);
  });

  it('an empty set is all zeroes, never undefined', () => {
    expect(summariseDelivery([], NOW)).toEqual({
      in_app_only: 0, accepted_pending: 0, confirmed: 0, unknown: 0, failed: 0,
    });
  });
});
