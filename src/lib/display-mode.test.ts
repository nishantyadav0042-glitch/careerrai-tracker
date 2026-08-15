import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { displayModeFrom } from '@/lib/journey';

// PLATFORM TELEMETRY — the numbers every platform decision is made from.
//
// Found 9 Aug, by the founder asking "how is this possible, our app is not live
// on Play Store?" — a question the data could not survive.

describe('a WhatsApp click is not a Play Store install', () => {
  it('reports twa ONLY when the store cookie says so', () => {
    // `document.referrer.startsWith('android-app://')` was the whole test, and
    // WhatsApp/Instagram/Gmail all set that referrer. Eleven people were filed
    // as Play Store users while the app was not on the Play Store.
    expect(displayModeFrom({ storeSource: 'twa', standalone: false })).toBe('twa');
    expect(displayModeFrom({ storeSource: null, standalone: false })).toBe('browser');
    expect(displayModeFrom({ storeSource: null, standalone: true })).toBe('standalone');
  });

  it('gives the live iOS App Store build its own mode', () => {
    // A WKWebView never matches `display-mode: standalone`, so every App Store
    // session was filed as a plain browser tab and the app was unmeasurable.
    expect(displayModeFrom({ storeSource: 'ios', standalone: false })).toBe('ios_app');
    expect(displayModeFrom({ storeSource: 'ios', standalone: true })).toBe('ios_app');
  });

  it('lets the wrapper cookie win over the standalone media query', () => {
    // An Android TWA is a Custom Tab and also matches the media query; the
    // cookie is the more specific fact and must not be masked by it.
    expect(displayModeFrom({ storeSource: 'twa', standalone: true })).toBe('twa');
  });
});

describe('the referrer no longer stands in for a wrapper launch', () => {
  it('detectDisplayMode reads the cookie, not document.referrer', () => {
    // Comments are stripped first: the fix leaves a comment NAMING the thing it
    // removed ("the cr_store cookie, never document.referrer"), and matching
    // prose instead of code would fail the guard on the very fix it guards.
    const src = readFileSync('src/lib/journey.ts', 'utf8');
    const fn = src.slice(src.indexOf('export function detectDisplayMode'));
    const body = fn.slice(0, fn.indexOf('\n}'))
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(body).toContain('cr_store');
    expect(body, 'referrer is not evidence of a wrapper').not.toContain('referrer');
  });

  it('launchedFromAndroidApp requires the cookie to corroborate', () => {
    const src = readFileSync('src/lib/store-build.ts', 'utf8');
    const fn = src.slice(src.indexOf('export function launchedFromAndroidApp'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('android-app://');
    expect(body, 'the referrer must not be sufficient on its own').toContain("storeCookieValue() === 'twa'");
  });

  it('the new mode survives the ingest allowlists', () => {
    // A value the door drops is a value that does not exist.
    //
    // push/subscribe's own allowlist moved on 15 Aug into
    // push-subscription-registry.ts (registerSubscription/normalisePushContext)
    // — the same validation, shared with the pre-auth signup path, not a
    // weaker one. The route itself no longer names the values; the file that
    // now decides them does, so the guard follows the logic, not the route.
    for (const f of ['src/app/api/events/track/route.ts', 'src/lib/push-subscription-registry.ts']) {
      expect(readFileSync(f, 'utf8'), `${f} would drop ios_app`).toContain('ios_app');
    }
  });
});
