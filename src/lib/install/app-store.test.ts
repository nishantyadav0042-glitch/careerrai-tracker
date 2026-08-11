import { describe, it, expect } from 'vitest';
import { resolveStrategy, CAPABILITY_MATRIX } from './capabilities';
import { APP_STORE_URL, APP_STORE_ID } from './store-links';
import type { InstallEnvironment, Platform, BrowserName, InAppBrowser } from './types';

// ── Every iPhone goes to the App Store. ─────────────────────────────────────
//
// Founder, 10 Aug 2026, with the live listing:
// https://apps.apple.com/in/app/careerrai/id6792102977
//
// Before this, iOS was the worst install path in the product. Safari was
// Share → Add to Home Screen (3 taps, no completion signal we could measure).
// From an Instagram or WhatsApp webview — where a large share of our traffic
// actually arrives — it was ESCAPE to Safari first, and only then those 3 taps.
//
// apps.apple.com is a universal link, so iOS hands it straight to the App Store
// app even from inside those webviews. The worst path became the best one, and
// these tests exist so a later refactor of resolveStrategy cannot quietly send
// iPhones back to the coachmark.

function env(over: Partial<InstallEnvironment> = {}): InstallEnvironment {
  return {
    platform: 'ios' as Platform,
    engine: 'webkit',
    browser: 'safari' as BrowserName,
    inApp: null as InAppBrowser,
    displayMode: 'browser',
    isStandalone: false,
    isNativeShell: false,
    capabilities: {
      mayFireBeforeInstallPrompt: false,
      canOneTapInstallHere: false,
      supportsAddToHomeScreen: true,
      isInAppBrowser: false,
      supportsInstalledRelatedApps: false,
      supportsStandaloneDetection: true,
    },
    ua: '',
    ...over,
  };
}

const FRESH = { hasDeferredPrompt: false, alreadyInstalled: false };

describe('the App Store link', () => {
  it('points at the real listing, with the India storefront', () => {
    expect(APP_STORE_URL).toBe('https://apps.apple.com/in/app/careerrai/id6792102977');
    // /in/ skips Apple's storefront picker for our students, who are all in India.
    expect(APP_STORE_URL).toContain('/in/');
    expect(APP_STORE_URL).toContain(APP_STORE_ID);
    // https + apps.apple.com is what makes iOS treat it as a universal link and
    // hand off to the App Store app. itms-apps:// or a bare id would not.
    expect(APP_STORE_URL.startsWith('https://apps.apple.com/')).toBe(true);
  });
});

describe('iOS install routing', () => {
  it('sends Safari on iPhone to the App Store, not the coachmark', () => {
    expect(resolveStrategy(env(), FRESH)).toBe('ios-app-store');
  });

  it('sends every other iOS browser there too — they are all WebKit', () => {
    for (const browser of ['chrome-ios', 'edge-ios', 'firefox-ios'] as BrowserName[]) {
      expect(resolveStrategy(env({ browser }), FRESH)).toBe('ios-app-store');
    }
  });

  it('sends iPad there as well', () => {
    expect(resolveStrategy(env({ platform: 'ipados' }), FRESH)).toBe('ios-app-store');
  });

  // The single biggest win, and the reason the App Store branch is placed
  // ABOVE the in-app-browser escape rather than below it.
  it('rescues the in-app browsers — no escape-to-Safari detour', () => {
    for (const inApp of ['instagram', 'whatsapp', 'facebook', 'telegram'] as InAppBrowser[]) {
      const e = env({
        inApp,
        browser: 'webview',
        capabilities: { ...env().capabilities, isInAppBrowser: true, supportsAddToHomeScreen: false },
      });
      expect(resolveStrategy(e, FRESH)).toBe('ios-app-store');
    }
  });

  it('still shows nothing once the app is on the device', () => {
    expect(resolveStrategy(env({ isStandalone: true }), FRESH)).toBe('already-installed');
    expect(resolveStrategy(env(), { ...FRESH, alreadyInstalled: true })).toBe('already-installed');
  });

  it('leaves Android completely alone', () => {
    const android = env({
      platform: 'android',
      engine: 'chromium',
      browser: 'chrome',
      capabilities: { ...env().capabilities, mayFireBeforeInstallPrompt: true },
    });
    expect(resolveStrategy(android, { ...FRESH, hasDeferredPrompt: true })).toBe('native-prompt');
    // And an Android webview still escapes to Chrome — that path is unchanged.
    const androidWebview = env({
      platform: 'android',
      browser: 'webview',
      inApp: 'instagram',
      capabilities: { ...env().capabilities, isInAppBrowser: true },
    });
    expect(resolveStrategy(androidWebview, FRESH)).toBe('android-open-in-chrome');
  });

  it('the published matrix agrees with the resolver about iOS', () => {
    // The matrix is what the admin view and the architecture doc read. A matrix
    // that says "3 taps, Share sheet" while the code sends people to the App
    // Store is how a wrong support answer gets given with total confidence.
    const iosRows = CAPABILITY_MATRIX.filter((r) => r.os.includes('iOS'));
    expect(iosRows.length).toBeGreaterThan(0);
    for (const row of iosRows) {
      expect(row.strategy).toBe('ios-app-store');
      expect(row.expectedTaps).toBe('1');
    }
  });
});
