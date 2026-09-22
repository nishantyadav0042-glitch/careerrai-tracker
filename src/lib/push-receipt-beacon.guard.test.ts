import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { displayColumns, readDisplayOutcome } from './notification-endpoints';

// ── THE RECEIPT BEACON MUST NOT WAIT FOR ANYTHING ───────────────────────────
//
// Incident #102. Between 17 and 22 Sep 2026 the receipt beacon was chained
// behind `showNotification()`'s promise so a display outcome could ride the
// same request and save one network call on a waking radio. The commit stated
// the trade and judged it small: "showNotification() is a local call that
// settles in milliseconds."
//
// Measured cost: device confirmation fell 62% -> 12% over four days, in a
// decay curve matching service-worker adoption rather than any single event.
// 94 endpoints stopped confirming and never resumed, none of them revoked,
// across every platform in proportion. 16 of those students CLICKED a
// notification in the same window — so the worker was alive, the notification
// rendered, and the click beacon from this same file arrived. Only the
// chained one was lost.
//
// A grep is a blunt instrument and this is the right place for one: the defect
// is not a value a unit test can assert, it is a SHAPE in a file that no test
// runner ever executes. `public/sw.js` runs in a browser, not in vitest, so
// this file is the only thing standing between that shape and production.

const SW = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

/** The push handler only — notificationclick has its own beacon and its own rules. */
const PUSH_HANDLER = SW.slice(
  SW.indexOf("self.addEventListener('push'"),
  SW.indexOf("self.addEventListener('notificationclick'"),
);

describe('the receipt beacon fires unchained', () => {
  it('the push handler exists and is the block we are checking', () => {
    expect(PUSH_HANDLER.length).toBeGreaterThan(500);
    expect(PUSH_HANDLER).toContain("beaconWithRetry('/api/push/received'");
  });

  it('calls the receipt beacon WITHOUT waiting on showNotification', () => {
    // The unchained call takes three arguments; the display call takes four.
    // A three-argument call is the receipt, and it must appear outside any
    // `settled.then(`. This is the exact line whose absence caused #102.
    const unchained = /work\.push\(\s*beaconWithRetry\(\s*'\/api\/push\/received',\s*notifId,\s*endpointId\s*\)/;
    expect(
      unchained.test(PUSH_HANDLER),
      'the receipt beacon must be called directly, never behind settled.then() — see Incident #102',
    ).toBe(true);
  });

  it('never has the receipt as the ONLY receipt call, chained behind settled', () => {
    // Belt and braces: if someone deletes the unchained call and leaves only
    // the chained one, the test above already fails. This one catches the
    // subtler regression — collapsing the two back into one chained beacon.
    const calls = [...PUSH_HANDLER.matchAll(/beaconWithRetry\(\s*'\/api\/push\/received'/g)];
    expect(calls.length, 'expected two receipt-path beacons: the receipt and the display outcome').toBe(2);
  });

  it('the display outcome IS chained, because there is nothing to send until it settles', () => {
    const chained = /settled\.then\(\s*function\s*\(\)\s*\{\s*return beaconWithRetry\(\s*'\/api\/push\/received',\s*notifId,\s*endpointId,\s*display\s*\)/;
    expect(chained.test(PUSH_HANDLER)).toBe(true);
  });

  it('both beacons are inside waitUntil, so the worker is kept alive for them', () => {
    expect(PUSH_HANDLER).toContain('event.waitUntil(Promise.all(work))');
  });

  it('records why, so the next person to "save a request" reads the price first', () => {
    expect(PUSH_HANDLER).toMatch(/Incident #102/);
    expect(PUSH_HANDLER, 'the measured cost must stay next to the code').toMatch(/62%\s*->\s*12%/);
  });
});

describe('the display outcome survives arriving second', () => {
  // The receipt now always wins the race, so every display outcome lands on a
  // row that is ALREADY confirmed. If confirmDelivery treats that as a replay
  // and returns without writing, display_status stays null forever — which is
  // precisely the symptom #102 presented with.
  const SRC = readFileSync(join(process.cwd(), 'src/lib/notification-endpoints.ts'), 'utf8');

  it('confirmDelivery writes display columns onto an already-confirmed row', () => {
    expect(SRC).toMatch(/if \(display && !existing\.display_status\)/);
    expect(SRC, 'the second write must target the existing row').toMatch(/\.update\(displayCols\)/);
  });

  it('and does so write-once, so a replay cannot overwrite the first outcome', () => {
    const branch = SRC.slice(SRC.indexOf('if (display && !existing.display_status)'));
    expect(branch.slice(0, 400)).toMatch(/\.is\('display_status', null\)/);
  });

  it('reads display_status back, or it cannot know whether to write', () => {
    expect(SRC).toMatch(/select\('id, device_confirmed_at, display_status'\)/);
  });
});

describe('the display mapping itself is unchanged by this fix', () => {
  const now = '2026-09-22T06:00:00.000Z';

  it('a resolved display stamps displayed_at and clears any error', () => {
    expect(displayColumns({ attempted: true, resolved: true, error: 'ignored' }, now)).toEqual({
      display_attempted_at: now,
      displayed_at: now,
      display_error_at: null,
      display_status: 'resolved',
      display_error: null,
    });
  });

  it('a rejected display stamps the error, never displayed_at', () => {
    expect(displayColumns({ attempted: true, resolved: false, error: 'boom' }, now)).toEqual({
      display_attempted_at: now,
      displayed_at: null,
      display_error_at: now,
      display_status: 'error',
      display_error: 'boom',
    });
  });

  it('malformed wire input is null, and a receipt must never depend on it', () => {
    expect(readDisplayOutcome(undefined)).toBeNull();
    expect(readDisplayOutcome({ attempted: 'yes', resolved: true })).toBeNull();
    expect(readDisplayOutcome({ attempted: true, resolved: true, error: null }))
      .toEqual({ attempted: true, resolved: true, error: null });
  });
});
