import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';

// ── A PAYING STUDENT MUST NEVER BE SHOWN THE SIGNUP FUNNEL ──────────────────
//
// 29 Aug 2026. CareerRai's most engaged paying student opened his installed
// home-screen app and got "Build Your FREE Personal CAT Study Plan" — the
// nine-screen funnel he completed weeks earlier. In his words: "Shows this
// page again. Then i log in."
//
// The proxy already guards this with `user_role`, an httpOnly 30-day cookie.
// It failed because his browser lost EVERY cookie for the origin at once —
// the auth cookies AND the httpOnly one — which nothing in our code and no
// script on the page can do. An empty jar makes a three-week student look
// exactly like a stranger, and he was given the stranger's door.
//
// The fix is a signal that does not live in the jar: the manifest's start_url
// carries ?source=pwa, so a home-screen launch proves a prior install even
// with zero cookies.

const ROOT = join(__dirname, '..');
const proxy = codeOnly(readFileSync(join(ROOT, 'proxy.ts'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(ROOT, '..', 'public', 'manifest.json'), 'utf8'));

describe('the installed app announces itself on every launch', () => {
  it('the manifest start_url still carries the marker this depends on', () => {
    // If start_url ever loses ?source=pwa, the guard below silently stops
    // protecting anyone. Pin the contract, not the intention.
    expect(manifest.start_url).toMatch(/[?&]source=pwa\b/);
  });

  it('the proxy reads that exact parameter', () => {
    expect(proxy).toMatch(/searchParams\.get\('source'\)\s*===\s*'pwa'/);
  });

  it('a launch is remembered in a cookie, so the NEXT request is covered too', () => {
    // /app hands off to /student/tracker, and that second request no longer
    // carries the query parameter — it is the one that would hit the funnel.
    expect(proxy).toMatch(/cookies\.set\('cr_pwa'/);
    expect(proxy.slice(proxy.indexOf("cookies.set('cr_pwa'"), proxy.indexOf("cookies.set('cr_pwa'") + 260))
      .toMatch(/httpOnly:\s*true/);
  });
});

describe('a returning student is sent to login, never to the funnel', () => {
  const branch = proxy.slice(proxy.indexOf('const returning ='), proxy.indexOf('const returning =') + 700);

  it('an installed launch counts as returning, by cookie or by launch URL', () => {
    expect(branch).toMatch(/cr_pwa/);
    expect(branch).toMatch(/pwaLaunch/);
  });

  it('user_role still counts — the new signal ADDS to it, never replaces it', () => {
    // A browser student who never installed keeps the protection they had.
    expect(branch).toMatch(/user_role/);
  });

  it('the funnel is still reachable for someone genuinely new', () => {
    // The whole value of /start is that a NEW student answers nine questions
    // before signing up. This must not become "everyone goes to /login".
    expect(proxy).toMatch(/'\/start'/);
    expect(proxy).toMatch(/returning \|\|/);
  });
});

describe('the store-wrapper question stays separate', () => {
  it("normalizeStoreSource is not taught to accept 'pwa'", () => {
    // It answers a different question — which STORE wrapper is this, which
    // drives Razorpay behaviour and App Review posture. Marking web PWA users
    // as a store build would disable inline payment for them.
    const storeBuild = codeOnly(readFileSync(join(ROOT, 'lib', 'store-build.ts'), 'utf8'));
    expect(storeBuild).not.toMatch(/case 'pwa'/);
  });
});
