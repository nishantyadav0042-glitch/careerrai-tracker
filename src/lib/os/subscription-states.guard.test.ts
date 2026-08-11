import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── There are two kinds of student. That is the whole model. ────────────────
//
// Founder, 10 Aug 2026: "we have simple thing — who paid subscription for us is
// premium account. What is beta account? Remove that. There is only two things:
// premium account, which is the students paid for the subscription of the
// buddy, and normal accounts which did nothing, just using our app for free.
// There is nothing like beta account on our app."
//
// He is right, and the value was a fossil. `free_beta` was the signup default
// from 20260613, back when the product genuinely was a free beta with no
// paywall. The app went freemium; the value never moved. By 10 Aug it was
// stamped on 268 accounts — including every buddy and the admin — and the
// student-facing card built on it still read "You're on the free beta — full
// access, no charge", which under freemium is simply untrue: a free student has
// no mentor, and the mentor is the thing you pay for. The single most important
// screen for conversion was telling people they already had everything.
//
// Migration 20260810g renamed the value to `free` and narrowed the CHECK
// constraint so the old one cannot be written again. This test defends the
// other half — the code — because a stale string in a type union or a label map
// is exactly how a dead concept comes back to life.

const SRC = 'src';

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry.name)) yield full;
  }
}

/** Strip comments so prose ABOUT the rename doesn't read as the rename. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

describe('the subscription model has exactly two ends: premium and free', () => {
  it('no file stores or renders the dead "free_beta" state', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      // This guard names the thing it forbids, so it must not accuse itself.
      if (file.endsWith('subscription-states.guard.test.ts')) continue;
      if (/free_beta/i.test(code(readFileSync(file, 'utf8')))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('nothing shows a student the word "beta"', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (file.endsWith('subscription-states.guard.test.ts')) continue;
      const src = code(readFileSync(file, 'utf8'));
      // The Gemini endpoint is v1beta — a URL, not a subscription state.
      if (/\bfree beta\b/i.test(src) || /'Free beta'/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('no source file writes a status the DB constraint rejects', () => {
    // Incident #27 (11 Aug): migration 20260810g reached production ~20 hours
    // before this code did, and in that window every signup's profile write
    // bounced off the narrowed CHECK constraint — name, phone and source lost
    // in one rejected row, silently. The constraint and the writers must name
    // the same set, and whichever side moves alone turns CI red first.
    const DB_ALLOWED = ['free', 'active', 'expired', 'paused', 'refund_requested'];
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = code(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(/subscription_status['"]?\s*:\s*'([a-z_]+)'/g)) {
        if (!DB_ALLOWED.includes(m[1])) offenders.push(`${file}: '${m[1]}'`);
      }
    }
    expect(
      offenders,
      `a write uses a subscription_status the profiles CHECK constraint rejects (allowed: ${DB_ALLOWED.join(', ')})`,
    ).toEqual([]);
  });

  it('a free student is never told they already have full access', () => {
    // The specific lie that was live until 10 Aug. Under freemium the app is
    // free and the MENTOR is paid; saying "full access, no charge" on the
    // upgrade card removes every reason to pay.
    const card = code(readFileSync('src/components/membership-card.tsx', 'utf8'));
    expect(card).not.toMatch(/full access, no charge/i);
    expect(card).toMatch(/paid part/i);
  });
});
