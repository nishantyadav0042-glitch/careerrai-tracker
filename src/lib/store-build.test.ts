import { describe, it, expect } from 'vitest';
import { normalizeStoreSource, isIosStoreBuildFrom, buildGoUrl, type IosStoreSignals } from './store-build';

// The one accepted-values list for "?source= says this is a store build."
// Guarded by tests because this exact concept once had TWO implementations —
// proxy.ts checked twa|ios for its cookie while install/detect.ts checked
// ios-app|android-app for its localStorage flag, so no single start URL
// satisfied both. Every layer now calls this function; these tests are what
// stop a third list from quietly appearing with different values.

describe('normalizeStoreSource', () => {
  it('accepts the canonical values', () => {
    expect(normalizeStoreSource('twa')).toBe('twa');
    expect(normalizeStoreSource('ios')).toBe('ios');
  });

  it('normalises the documented aliases to canonical values', () => {
    // These appeared in the App Store runbook before the two lists were
    // unified. A start URL configured from any doc version must keep working,
    // and must produce the canonical cookie value that regex consumers expect.
    expect(normalizeStoreSource('ios-app')).toBe('ios');
    expect(normalizeStoreSource('android-app')).toBe('twa');
  });

  it('rejects everything else', () => {
    for (const junk of ['IOS', 'Twa', 'web', 'pwa', 'ios-app-2', '', ' ios', 'twa ']) {
      expect(normalizeStoreSource(junk), `"${junk}" must not mark a store build`).toBeNull();
    }
    expect(normalizeStoreSource(null)).toBeNull();
    expect(normalizeStoreSource(undefined)).toBeNull();
  });
});

// ── The iOS payment branch ──────────────────────────────────────────────────
//
// Added 31 Jul 2026 after iOS payment was found 100% broken in production:
// window.open() returns null inside WKWebView while the wrapper still paints a
// blank view over the app, so the student saw a white screen with the fallback
// stranded underneath. Three Buy taps, three `opened:false`, zero hand-off
// tokens minted. iOS now skips window.open and renders a real link instead.
//
// THE RULE THESE TESTS EXIST TO ENFORCE: an Android device must NEVER reach
// the iOS branch. Android's escape works and is what Play review sees; routing
// it onto an untested path while a Play submission is open is the one mistake
// this change must not make.

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';

const base: IosStoreSignals = {
  storeBuild: true, androidReferrer: false, cookie: null,
  userAgent: IPHONE_UA, platform: 'iPhone', maxTouchPoints: 5,
};
const sig = (over: Partial<IosStoreSignals> = {}): IosStoreSignals => ({ ...base, ...over });

describe('isIosStoreBuildFrom — Android must never take the iOS path', () => {
  it('is false for the Play TWA, identified by its android-app referrer', () => {
    expect(isIosStoreBuildFrom(sig({
      androidReferrer: true, userAgent: ANDROID_UA, platform: 'Linux armv8l', maxTouchPoints: 5,
    }))).toBe(false);
  });

  it('is false for the Play TWA even when the referrer is missing', () => {
    // Belt and braces: the cookie alone rules Android out, so a TWA launch that
    // somehow loses its referrer still stays on the working escape.
    expect(isIosStoreBuildFrom(sig({
      cookie: 'twa', userAgent: ANDROID_UA, platform: 'Linux armv8l', maxTouchPoints: 5,
    }))).toBe(false);
  });

  it('is false for an Android user-agent with no cookie and no referrer at all', () => {
    // The failure mode this guards: a "not Android, therefore iOS" default.
    // With every Android signal stripped away, the UA alone must still refuse.
    expect(isIosStoreBuildFrom(sig({
      cookie: null, androidReferrer: false,
      userAgent: ANDROID_UA, platform: 'Linux armv8l', maxTouchPoints: 5,
    }))).toBe(false);
  });
});

describe('isIosStoreBuildFrom — iOS must take it', () => {
  it('is true when the cookie says ios', () => {
    expect(isIosStoreBuildFrom(sig({ cookie: 'ios' }))).toBe(true);
  });

  it('is true for an iPhone user-agent with no cookie', () => {
    // The cookie can be absent — it is set by the proxy on the launch
    // navigation and does not survive every path. The UA is the backstop.
    expect(isIosStoreBuildFrom(sig({ cookie: null, userAgent: IPHONE_UA }))).toBe(true);
  });

  it('is true for an iPad reporting a desktop Safari user-agent', () => {
    // iPadOS defaults to a Mac UA; only the touch-point count gives it away.
    expect(isIosStoreBuildFrom(sig({
      cookie: null, userAgent: IPAD_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 5,
    }))).toBe(true);
  });

  it('is false on a real Mac, which has the same UA but no touch', () => {
    expect(isIosStoreBuildFrom(sig({
      cookie: null, userAgent: IPAD_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 0,
    }))).toBe(false);
  });
});

describe('isIosStoreBuildFrom — outside a store build', () => {
  it('is false everywhere when this is not a store build', () => {
    // Web and browser-installed PWA keep inline Razorpay. An iPhone in Safari
    // must never be pushed onto the hand-off link path.
    for (const over of [{}, { cookie: 'ios' as const }, { userAgent: IPHONE_UA }]) {
      expect(isIosStoreBuildFrom(sig({ ...over, storeBuild: false }))).toBe(false);
    }
  });
});

describe('buildGoUrl', () => {
  it('carries the token and the destination, on our own origin', () => {
    const url = new URL(buildGoUrl('tok_123', '/student/buddy', 'https://careerrai.in'));
    expect(url.origin).toBe('https://careerrai.in');
    expect(url.pathname).toBe('/go');
    expect(url.searchParams.get('k')).toBe('tok_123');
    expect(url.searchParams.get('dest')).toBe('/student/buddy');
  });

  it('encodes a destination with a query string rather than truncating it', () => {
    const url = new URL(buildGoUrl('t', '/student/plan/topics?status=revision', 'https://careerrai.in'));
    expect(url.searchParams.get('dest')).toBe('/student/plan/topics?status=revision');
  });

  it('produces a link /go will accept — same-origin, internal dest', () => {
    // /go only redirects to a dest starting with a single "/", so a URL built
    // here must always satisfy that or the student lands on the tracker.
    const dest = new URL(buildGoUrl('t', '/student/profile', 'https://careerrai.in')).searchParams.get('dest')!;
    expect(dest.startsWith('/')).toBe(true);
    expect(dest.startsWith('//')).toBe(false);
  });
});
