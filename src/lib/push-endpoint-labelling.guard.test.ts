import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { codeOnly } from './test-support/code-only';
import { detectPlatform } from './journey';

// ── PHASE 0.5 AUDIT: TWO MEASUREMENT DEFECTS, BOTH INVISIBLE ────────────────
//
// Found by auditing the push path against production before the device tests,
// not by a failure. Both would have corrupted Phase 1's results silently.
//
// 1. EVERY ENDPOINT SINCE 1 SEPTEMBER WAS LABELLED platform:'unknown'.
//    `/api/push/subscribe` has always read `body?.platform`; nothing ever sent
//    it, so `registerWebPushEndpoint` fell through to its `?? 'unknown'`
//    default on every subscribe. The rows reading 'android' are all from the
//    20260901a backfill — their newest `registered_at` is 1 Sep. It stayed
//    invisible because `context` WAS sent and correct, so the pair looked
//    populated. A per-surface reading of a device test cannot be joined to a
//    column that says 'unknown' for every row created during the test.
//
// 2. A RE-SEND MUST NOT ERASE WHAT THE DEVICE TOLD US. `recordDelivery`
//    upserts the sender's own facts and deliberately omits
//    `device_confirmed_at`, because ON CONFLICT DO UPDATE touches only the
//    columns it names. Phase 0's receipt and display columns now depend on
//    that same omission and nothing stated it — naming any of them there would
//    wipe a real display record on the next re-send, and no test would fail.

describe('an endpoint is labelled with the surface it was created on', () => {
  it('subscribe sends platform, not just context', () => {
    const client = readFileSync('src/lib/push-client.ts', 'utf8');
    expect(client, 'the defect was the absent half of this pair')
      .toMatch(/subscription: sub\.toJSON\(\), context, platform: detectPlatform\(\)/);
  });

  it('reuses the shipped detector rather than a second one that could disagree', () => {
    const client = readFileSync('src/lib/push-client.ts', 'utf8');
    expect(client).toContain("import { detectPlatform } from '@/lib/journey'");
    // A second UA parser in this file would drift from the one labelling every
    // analytics event, and the two would disagree about the same device.
    expect(client, 'no private user-agent parsing here').not.toMatch(/navigator\.userAgent/);
  });

  it('every value the detector can return is a value the column accepts', () => {
    // PLATFORMS in notification-endpoints.ts is the schema CHECK's mirror.
    const mod = readFileSync('src/lib/notification-endpoints.ts', 'utf8');
    const allowed = mod.slice(mod.indexOf('const PLATFORMS'), mod.indexOf('const PLATFORMS') + 160);
    for (const v of ['android', 'ios', 'desktop']) expect(allowed).toContain(`'${v}'`);
    // The detector is UA-driven, so assert its shape rather than a live value.
    expect(typeof detectPlatform()).toBe('string');
    expect(['android', 'ios', 'desktop']).toContain(detectPlatform());
  });

  it('the server still normalises rather than trusting the wire', () => {
    // The client now sends it; that does not make it trusted input.
    const mod = readFileSync('src/lib/notification-endpoints.ts', 'utf8');
    expect(mod).toMatch(/normalisePlatform\(opts\?\.platform\)/);
    expect(mod, 'anything unrecognised is still unknown').toMatch(/PLATFORMS\.has\(raw\) \? raw : null/);
  });
});

describe('a re-send never erases what the device reported', () => {
  // Comments only, stripped: the function's own note EXPLAINS that
  // device_confirmed_at is deliberately absent, so a raw-text assertion would
  // read the explanation and call it a violation. Guard the code, never the
  // prose about the code.
  const mod = codeOnly(readFileSync('src/lib/notification-endpoints.ts', 'utf8'));
  const recordDelivery = mod.slice(mod.indexOf('export async function recordDelivery'),
    mod.indexOf('export async function recordDelivery') + 900);

  it('recordDelivery names none of the device-reported columns', () => {
    // The sender owns provider_accepted_at / failed_at / fail_reason. Every
    // column below belongs to the DEVICE, and Postgres preserves exactly the
    // columns an upsert does not name. Adding one here would silently wipe a
    // real display record on the next re-send of the same notification.
    for (const col of [
      'device_confirmed_at', 'sw_receipt_at',
      'display_attempted_at', 'displayed_at',
      'display_status', 'display_error', 'display_error_at',
    ]) {
      expect(recordDelivery, `${col} belongs to the device, not the sender`).not.toContain(col);
    }
  });

  it('and it upserts on the pair, so a re-send updates one row rather than adding a second', () => {
    expect(recordDelivery).toContain("onConflict: 'notification_id,endpoint_id'");
  });
});
