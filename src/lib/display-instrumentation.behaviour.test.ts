import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { codeOnly } from './test-support/code-only';
import { parseDisplayReport } from './notification-endpoints';

/**
 * ── DID THE NOTIFICATION REACH THE SCREEN? (founder audit, 17 Sep 2026) ─────
 *
 * The audit found `device_confirmed_at` proves only that the service worker
 * EXECUTED, because sw.js fired that beacon as a sibling of showNotification()
 * rather than conditional on it. The two facts disagreed in both directions:
 *
 *   • displayed but never beaconed — 40 of 295 CLICKED notifications (13.6%)
 *     had no receipt, and a click proves display, so that is a floor;
 *   • beaconed but never displayed — a revoked notification permission leaves
 *     the subscription valid, so the provider accepts, the worker wakes, and
 *     the screen stays empty.
 *
 * What these tests protect:
 *   1. The notification is NEVER delayed or blocked by the measurement.
 *   2. A failed render is REPORTED, never swallowed, and never stamps a time.
 *   3. Junk from an untrusted beacon never reaches a queryable column.
 *   4. A v9 worker (no display fields) behaves exactly as it did before.
 */

describe('parseDisplayReport — an untrusted beacon body', () => {
  it('accepts the three real statuses and nothing else', () => {
    expect(parseDisplayReport({ displayStatus: 'shown' })?.status).toBe('shown');
    expect(parseDisplayReport({ displayStatus: 'failed' })?.status).toBe('failed');
    expect(parseDisplayReport({ displayStatus: 'unknown' })?.status).toBe('unknown');
    expect(parseDisplayReport({ displayStatus: 'delivered' })).toBeNull();
    expect(parseDisplayReport({ displayStatus: 'TRUE' })).toBeNull();
    expect(parseDisplayReport({ displayStatus: 1 as unknown as string })).toBeNull();
  });

  it('a v9 service worker sends nothing and gets null — the old path, untouched', () => {
    expect(parseDisplayReport({ id: 'x', endpointId: 'y' })).toBeNull();
    expect(parseDisplayReport({})).toBeNull();
  });

  it('only the four real permission values survive', () => {
    for (const p of ['granted', 'denied', 'default', 'unsupported']) {
      expect(parseDisplayReport({ displayStatus: 'shown', permission: p })?.permission).toBe(p);
    }
    expect(parseDisplayReport({ displayStatus: 'shown', permission: 'maybe' })?.permission).toBeNull();
    expect(parseDisplayReport({ displayStatus: 'shown' })?.permission).toBeNull();
  });

  it('caps the error string so a device cannot write unbounded text into our table', () => {
    const r = parseDisplayReport({ displayStatus: 'failed', displayError: 'x'.repeat(5000) });
    expect(r!.error!.length).toBe(200);
  });

  it('an empty error is null, not an empty string', () => {
    expect(parseDisplayReport({ displayStatus: 'failed', displayError: '' })?.error).toBeNull();
  });

  it('the silent failure this exists to catch is representable', () => {
    // Worker woke, permission had been revoked, nothing rendered. Before v10
    // this was indistinguishable from a healthy delivery.
    const r = parseDisplayReport({ displayStatus: 'failed', permission: 'denied', displayError: 'permission denied' });
    expect(r).toEqual({ status: 'failed', permission: 'denied', error: 'permission denied' });
  });
});

describe('confirmDelivery stamps a time only for a real render', () => {
  const src = codeOnly(readFileSync('src/lib/notification-endpoints.ts', 'utf8'));

  it("displayed_at is written ONLY when the status is 'shown'", () => {
    expect(src).toMatch(/display\.status === 'shown' \? \{ displayed_at: now \} : \{\}/);
  });

  it('the status, error and permission are recorded even when the render FAILED', () => {
    // A failure that is not recorded is the state this whole change replaces.
    expect(src).toMatch(/display_status: display\.status/);
    expect(src).toMatch(/display_error: display\.error/);
    expect(src).toMatch(/permission_at_push: display\.permission/);
  });

  it('the receipt still works with no display report at all', () => {
    expect(src).toMatch(/const displayPatch = display[\s\S]{0,400}: \{\};/);
    expect(src).toMatch(/device_confirmed_at: now, \.\.\.displayPatch/);
  });
});

describe('the service worker never trades the notification for the measurement', () => {
  const sw = readFileSync('public/sw.js', 'utf8');

  it('showNotification is started BEFORE the outcome is observed', () => {
    const started = sw.indexOf('const showPromise');
    const observed = sw.indexOf('const displayOutcome');
    expect(started).toBeGreaterThan(-1);
    expect(observed).toBeGreaterThan(started);
  });

  it('a rejected render resolves to a reportable failure, never an unhandled throw', () => {
    expect(sw).toMatch(/\.catch\(function \(err\) \{[\s\S]{0,200}status: 'failed'/);
  });

  it('permission is read at push time — a subscription can outlive its permission', () => {
    expect(sw).toMatch(/permissionAtPush/);
    expect(sw).toMatch(/Notification\.permission/);
  });

  it('the beacon waits for the render outcome and sends it', () => {
    expect(sw).toMatch(/displayOutcome\.then\(function \(d\) \{[\s\S]{0,300}beaconWithRetry\('\/api\/push\/received'/);
    expect(sw).toMatch(/displayStatus: d\.status/);
  });

  it('the click beacon body is unchanged — only /received grew a payload', () => {
    // beaconWithRetry's 4th arg is optional; the click call site passes none.
    expect(sw).toMatch(/beaconWithRetry\('\/api\/push\/click', data\.notifId\)/);
    expect(sw).toMatch(/const body = endpointId \? \{ id: notifId, endpointId: endpointId \} : \{ id: notifId \};/);
  });

  it('is version 10 — the rollout depends on the worker actually changing', () => {
    expect(sw.slice(0, 400)).toMatch(/v10/);
  });
});

describe('the API keeps display separate from receipt', () => {
  const route = codeOnly(readFileSync('src/app/api/push/received/route.ts', 'utf8'));

  it('parses the report through the validator, never straight from the body', () => {
    expect(route).toMatch(/const display = parseDisplayReport\(body\)/);
    expect(route).not.toMatch(/body\.displayStatus\s*(?:as|\))/);
  });

  it("student-level displayed_at is also 'shown'-only", () => {
    expect(route).toMatch(/display\?\.status === 'shown' \? \{ displayed_at: now \} : \{\}/);
  });

  it('received_at is still stamped regardless of what the render did', () => {
    // A worker that woke is a fact worth keeping even when nothing rendered.
    expect(route).toMatch(/received_at: now,/);
  });
});
