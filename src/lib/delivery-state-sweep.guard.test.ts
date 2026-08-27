import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── THE SWEEP AND THE RESOLVER MUST MEAN THE SAME THING ────────────────────
//
// needsUnknownStamp() decides 'unknown' for every READ surface. The cron
// decides it in SQL, because doing it in JS meant sending a list of ids whose
// length grows with the backlog — B3b gate 1 caught that, correctly, at ~18.5
// KB of UUIDs inside the bracket where the 23 Aug incident died.
//
// Two implementations of one question is exactly how a dashboard and its
// database stop agreeing. Nothing can diff SQL against a function, so this
// guard pins the five conditions that make them equivalent. Drop any one and
// the sweep starts stamping rows the resolver would never call unknown.
//
// Comments are stripped first. This repo has been bitten repeatedly by guards
// satisfied by their own explanatory prose — the block above would do it.

const ROUTE = join(process.cwd(), 'src/app/api/cron/push-recovery/route.ts');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Just the sweep function, so a filter elsewhere in the file cannot satisfy this. */
function sweepBody(): string {
  const code = codeOnly(readFileSync(ROUTE, 'utf8'));
  const at = code.indexOf('async function closeOutUnconfirmed');
  expect(at, 'closeOutUnconfirmed not found — update this guard').toBeGreaterThan(-1);
  return code.slice(at);
}

describe('the unknown sweep matches needsUnknownStamp, condition for condition', () => {
  it('only touches rows still claiming provider_accepted', () => {
    // Without this it re-stamps rows already resolved, and the count stops
    // meaning "newly resolved".
    expect(sweepBody()).toMatch(/\.eq\(\s*['"]send_status['"]\s*,\s*['"]provider_accepted['"]\s*\)/);
  });

  it('excludes rows with a receipt', () => {
    expect(sweepBody()).toMatch(/\.is\(\s*['"]received_at['"]\s*,\s*null\s*\)/);
  });

  it('excludes rows with a TAP', () => {
    // A tap proves delivery — 22 of 43 taps carried no received_at. Omitting
    // this stamps demonstrably-delivered notifications as unknown.
    expect(sweepBody()).toMatch(/\.is\(\s*['"]clicked_at['"]\s*,\s*null\s*\)/);
  });

  it('only considers rows where a push was actually attempted', () => {
    // in_app_only rows owe no delivery and must never become unknown.
    expect(sweepBody()).toMatch(/\.not\(\s*['"]pushed_at['"]\s*,\s*['"]is['"]\s*,\s*null\s*\)/);
  });

  it('waits for the confirmation window to elapse', () => {
    expect(sweepBody()).toMatch(/\.lt\(\s*['"]pushed_at['"]\s*,\s*cutoff\s*\)/);
  });

  it('takes the window from the ONE constant, never a local literal', () => {
    const code = codeOnly(readFileSync(ROUTE, 'utf8'));
    expect(code).toMatch(/CONFIRMATION_WINDOW_MS/);
    expect(code).toMatch(/from\s+['"]@\/lib\/delivery-state['"]/);
  });
});

describe('the sweep stays inside its lane', () => {
  it('sends no population-scaled id list — B3b gate 1', () => {
    // The shape that failed on 23 Aug: a request whose size grows with the
    // number of rows. The fix was set-based SQL, not a bigger limit.
    expect(sweepBody()).not.toMatch(/\.in\(\s*['"]id['"]/);
  });

  it('writes only send_status — it is bookkeeping, not a delivery decision', () => {
    const body = sweepBody();
    const update = body.match(/\.update\(\s*\{[^}]*\}\s*\)/);
    expect(update, 'no update found in the sweep').not.toBeNull();
    expect(update![0]).toContain('send_status');
    // Must never touch the arrival evidence it is reading.
    expect(update![0]).not.toContain('received_at');
    expect(update![0]).not.toContain('clicked_at');
    expect(update![0]).not.toContain('pushed_at');
  });

  it('never re-sends anything — this is not a retry authority', () => {
    const body = sweepBody();
    expect(body).not.toMatch(/\bdispatch\(/);
    expect(body).not.toMatch(/sendPushToUser|sendEmail|sendAdminAlert/);
  });

  it('its failure can never break the recovery digest', () => {
    expect(sweepBody()).toMatch(/catch\s*\([\s\S]{0,40}\)\s*\{[\s\S]{0,200}console\.error/);
  });
});
