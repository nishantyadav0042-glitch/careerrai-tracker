import { describe, it, expect } from 'vitest';
import {
  normalizeStoreSource, isIosStoreBuildFrom, userAgentFamily,
  shouldStampStoreCookie, storeCookieContradictsDevice, type IosStoreSignals,
} from './store-build';

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

  it('is false on Android even when the browser carries an ios cookie', () => {
    // Real and reachable: open a link containing ?source=ios on an Android
    // phone and proxy.ts stamps cr_store=ios on that browser. Before the
    // Android-UA veto this returned TRUE, putting a Play user on the iOS
    // branch and breaking the guarantee in this function's own docstring.
    expect(isIosStoreBuildFrom(sig({
      cookie: 'ios', androidReferrer: false,
      userAgent: ANDROID_UA, platform: 'Linux armv8l', maxTouchPoints: 5,
    }))).toBe(false);
  });

  it('refuses every Android combination there is', () => {
    for (const cookie of [null, 'ios', 'twa'] as const) {
      for (const androidReferrer of [true, false]) {
        expect(
          isIosStoreBuildFrom(sig({ cookie, androidReferrer, userAgent: ANDROID_UA, platform: 'Linux armv8l', maxTouchPoints: 5 })),
          `cookie=${cookie} referrer=${androidReferrer}`,
        ).toBe(false);
      }
    }
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


// ─────────────────────────────────────────────────────────────────────────────
// Who is allowed to be marked a store build in the first place.
//
// The cr_store cookie disables inline Razorpay and sends payment out to the
// real browser. Before this gate, ANY request carrying ?source=ios was marked,
// so a shared link that kept its query string marked a plain browser as a
// store build for ten years — silent conversion loss nobody would report.
//
// The asymmetry these tests pin down: refusing a REAL wrapper is far worse
// than marking a stray browser, because an unmarked iOS wrapper opens Razorpay
// inline in a WKWebView — the Apple 3.1.1 posture, and a payment path that is
// 100% broken there. So "cannot tell" must always mean yes.
// ─────────────────────────────────────────────────────────────────────────────

// The UA a WKWebView sends with no custom applicationNameForUserAgent. Note it
// carries no "Safari/" or "Version/" token, unlike Safari proper — which is
// why nothing here may test for those.
const IOS_WKWEBVIEW_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('userAgentFamily', () => {
  it('reads Android BEFORE Linux — the order is load-bearing', () => {
    // Android's UA is "(Linux; Android 14; ...)". A Linux test placed first
    // would classify every Android phone as a desktop and this whole gate
    // would invert on the platform most students are on.
    expect(userAgentFamily(ANDROID_UA)).toBe('android');
    expect(LINUX_UA).toContain('Linux');
    expect(userAgentFamily(LINUX_UA)).toBe('other');
  });

  it('treats every Apple surface as one family', () => {
    for (const ua of [IPHONE_UA, IOS_WKWEBVIEW_UA, IPAD_DESKTOP_UA, MAC_UA]) {
      expect(userAgentFamily(ua), ua).toBe('apple');
    }
  });

  it('classifies non-Apple desktops as other', () => {
    expect(userAgentFamily(WINDOWS_UA)).toBe('other');
    expect(userAgentFamily('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)')).toBe('other');
  });

  it('says unknown when there is no evidence, rather than guessing', () => {
    for (const ua of ['', '   ', null, undefined, 'CareerRai/1.0']) {
      expect(userAgentFamily(ua), JSON.stringify(ua)).toBe('unknown');
    }
  });
});

describe('shouldStampStoreCookie — never refuse a real wrapper', () => {
  it('marks the iOS wrapper, including a bare WKWebView UA', () => {
    expect(shouldStampStoreCookie('ios', IOS_WKWEBVIEW_UA)).toBe(true);
    expect(shouldStampStoreCookie('ios', IPHONE_UA)).toBe(true);
  });

  it('marks the Play TWA', () => {
    expect(shouldStampStoreCookie('twa', ANDROID_UA)).toBe(true);
  });

  it('marks an unreadable UA for either platform — "cannot tell" means yes', () => {
    // A custom applicationNameForUserAgent, a privacy proxy that strips the
    // header, anything unrecognised. Refusing here would silently un-mark a
    // wrapper and re-break iOS payment; marking a stray browser only costs a
    // conversion. Given that asymmetry, this must stay permissive.
    for (const ua of ['', null, undefined, 'CareerRai/1.0']) {
      expect(shouldStampStoreCookie('ios', ua), `ios / ${JSON.stringify(ua)}`).toBe(true);
      expect(shouldStampStoreCookie('twa', ua), `twa / ${JSON.stringify(ua)}`).toBe(true);
    }
  });

  it('marks an iPad in desktop mode, which the server cannot tell from a Mac', () => {
    // maxTouchPoints would separate them and does not exist on the server.
    // Erring toward marking is the safe direction; the cost is the Mac case
    // in the next test, which is deliberately accepted.
    expect(shouldStampStoreCookie('ios', IPAD_DESKTOP_UA)).toBe(true);
  });
});

describe('shouldStampStoreCookie — refuse the stray link', () => {
  it('refuses ?source=ios on Android, the case that motivated this', () => {
    expect(shouldStampStoreCookie('ios', ANDROID_UA)).toBe(false);
  });

  it('refuses ?source=ios on non-Apple desktops', () => {
    expect(shouldStampStoreCookie('ios', WINDOWS_UA)).toBe(false);
    expect(shouldStampStoreCookie('ios', LINUX_UA)).toBe(false);
  });

  it('refuses ?source=twa on anything that is not Android', () => {
    for (const ua of [IPHONE_UA, IOS_WKWEBVIEW_UA, IPAD_DESKTOP_UA, MAC_UA, WINDOWS_UA, LINUX_UA]) {
      expect(shouldStampStoreCookie('twa', ua), ua).toBe(false);
    }
  });

  it('still marks a Mac for ios — a known, accepted cost', () => {
    // Documented rather than fixed: 'apple' is one family so that no
    // iPad-shaped wrapper is ever refused. A Mac is a rounding error against
    // an Android-majority student base; an unmarked wrapper is not.
    expect(shouldStampStoreCookie('ios', MAC_UA)).toBe(true);
  });
});

describe('storeCookieContradictsDevice — cleaning up ten-year cookies already issued', () => {
  it('clears an ios cookie stranded on an Android phone', () => {
    // The live harm: gating new stamps does nothing for cookies already out
    // there, and this device has inline Razorpay disabled on every visit.
    expect(storeCookieContradictsDevice('ios', ANDROID_UA)).toBe(true);
    expect(storeCookieContradictsDevice('ios', WINDOWS_UA)).toBe(true);
  });

  it('clears a twa cookie stranded on an iPhone', () => {
    expect(storeCookieContradictsDevice('twa', IPHONE_UA)).toBe(true);
  });

  it('NEVER clears a real wrapper, which is the way this could hurt', () => {
    expect(storeCookieContradictsDevice('ios', IOS_WKWEBVIEW_UA)).toBe(false);
    expect(storeCookieContradictsDevice('ios', IPHONE_UA)).toBe(false);
    expect(storeCookieContradictsDevice('ios', IPAD_DESKTOP_UA)).toBe(false);
    expect(storeCookieContradictsDevice('twa', ANDROID_UA)).toBe(false);
  });

  it('never clears on an unreadable UA', () => {
    for (const ua of ['', null, undefined, 'CareerRai/1.0']) {
      expect(storeCookieContradictsDevice('ios', ua), JSON.stringify(ua)).toBe(false);
      expect(storeCookieContradictsDevice('twa', ua), JSON.stringify(ua)).toBe(false);
    }
  });

  it('does nothing when there is no cookie', () => {
    expect(storeCookieContradictsDevice(null, ANDROID_UA)).toBe(false);
    expect(storeCookieContradictsDevice(null, null)).toBe(false);
  });
});
