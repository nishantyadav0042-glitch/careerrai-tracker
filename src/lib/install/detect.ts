// Environment detection engine — the single source of truth for "where am I
// running and what can I do here." Every install component reads getEnvironment();
// nothing else sniffs the UA. SSR-safe: returns a neutral 'other' environment
// when window/navigator are absent.
//
// Detection order of preference (most→least reliable):
//   1. Real feature checks (display-mode media query, navigator.standalone,
//      presence of navigator.getInstalledRelatedApps, navigator.brave).
//   2. UA Client Hints (navigator.userAgentData) where available (Chromium).
//   3. User-agent string matching — last resort, but unavoidable for iOS
//      WebKit-forced browsers and for social webview detection (there is no
//      feature test that says "you are inside Instagram").

import type {
  BrowserName,
  DisplayMode,
  Engine,
  InAppBrowser,
  InstallCapabilities,
  InstallEnvironment,
  Platform,
} from './types';
import { normalizeStoreSource, storeCookieValue, launchedFromAndroidApp, hasStoreBuildFlag } from '@/lib/store-build';

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

function ua(): string {
  return hasWindow() ? navigator.userAgent || '' : '';
}

// ---------------------------------------------------------------------------
// Display mode / standalone — the ONE thing that is genuinely feature-detectable
// ---------------------------------------------------------------------------

export function getDisplayMode(): DisplayMode {
  if (!hasWindow() || typeof window.matchMedia !== 'function') return 'unknown';
  const modes: DisplayMode[] = ['standalone', 'minimal-ui', 'fullscreen'];
  for (const m of modes) {
    if (window.matchMedia(`(display-mode: ${m})`).matches) return m;
  }
  return 'browser';
}

// ---------------------------------------------------------------------------
// Native app shell (App Store / Play Store build)
// ---------------------------------------------------------------------------
// An iOS WKWebView wrapper is NOT display-mode:standalone and has no
// navigator.standalone, so detectStandalone() reads it as plain iOS Safari and
// the UI happily offers "Install the app — no app store needed" INSIDE a build
// distributed by the App Store. That is both nonsense to the user and exactly
// the kind of non-App-Store-distribution messaging App Review penalises
// (guideline 2.3.10, and it invites a 4.2 look at the same time).
//
// CORRECTED 29 Jul: the first version of this function was a second, parallel
// implementation of "am I inside the store build?" — its own param list
// ('ios-app'/'android-app', which proxy.ts's cookie never matched) and its own
// storage key, and it never read the server-set cr_store cookie. Net effect:
// on the wrapper's FIRST run the logged-out redirect stripped the ?source=
// param before any client code mounted, no flag was ever set, and the login
// screen — the exact screen App Review lands on — still showed the install
// banner. lib/store-build.ts had already solved every part of this (canonical
// values, a middleware cookie that survives the redirect, the android-app://
// referrer). This now delegates to it; NATIVE_SHELL_KEY remains only as a
// local cache and for devices that stored it before the fix.

const NATIVE_SHELL_KEY = 'cr_native_shell';

export function detectNativeShell(): boolean {
  if (!hasWindow()) return false;
  try {
    const fromUrl = normalizeStoreSource(new URLSearchParams(window.location.search).get('source'));
    const isShell =
      fromUrl != null ||
      storeCookieValue() != null ||      // server-set: survives the login redirect
      launchedFromAndroidApp() ||        // TWA launch referrer, needs no storage
      hasStoreBuildFlag() ||             // store-build.ts's persisted flag
      window.localStorage.getItem(NATIVE_SHELL_KEY) != null;
    if (isShell) window.localStorage.setItem(NATIVE_SHELL_KEY, fromUrl ?? storeCookieValue() ?? 'shell');
    return isShell;
  } catch {
    return false; // private mode / storage blocked — fail open, never crash
  }
}

export function detectStandalone(): boolean {
  if (!hasWindow()) return false;
  const byMedia =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches);
  // iOS Safari home-screen apps expose the legacy navigator.standalone boolean.
  const byIOS = 'standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(byMedia || byIOS);
}

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

export function detectPlatform(): Platform {
  if (!hasWindow()) return 'other';
  const s = ua();
  // iPadOS 13+ reports a desktop-Mac UA; distinguish by touch points.
  const isIPadOS =
    /Macintosh/.test(s) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
  if (/iPad/.test(s) || isIPadOS) return 'ipados';
  if (/iPhone|iPod/.test(s)) return 'ios';
  if (/Android/.test(s)) return 'android';
  if (/Windows|Macintosh|Linux|CrOS/.test(s)) return 'desktop';
  return 'other';
}

export function detectIOS(): boolean {
  const p = detectPlatform();
  return p === 'ios' || p === 'ipados';
}

export function detectAndroid(): boolean {
  return detectPlatform() === 'android';
}

// ---------------------------------------------------------------------------
// In-app (social / messaging) webview detection — UA-only, by necessity
// ---------------------------------------------------------------------------
// Ordered most-specific → least, because several apps share tokens (Messenger
// carries FBAN too; Line carries a webview flag). First match wins.

export function detectInAppBrowser(): InAppBrowser {
  const s = ua();
  if (!s) return null;

  // Telegram is the one app that does NOT tag the UA reliably — it injects
  // window globals instead (verified against inapp-spy). Check these first.
  if (hasWindow()) {
    const w = window as unknown as Record<string, unknown>;
    if (w.TelegramWebview || w.TelegramWebviewProxy || w.TelegramWebviewProxyProto) return 'telegram';
  }

  // Messenger before Facebook — Messenger's UA carries FB tokens PLUS a
  // "Messenger" segment, so it must be tested first or it mislabels as Facebook.
  if (/Messenger/i.test(s) && /\bFB(AN|_IAB)\b/i.test(s)) return 'messenger';
  if (/Instagram/i.test(s)) return 'instagram';
  // Facebook/Messenger family tokens: FBAN, FBAV, FB_IAB, FB4A, FBIOS, FBSV…
  if (/\bFB(AN|AV|_IAB|IOS|SV|SS|4A|BV|DV)\b|\[FB/i.test(s)) return 'facebook';
  // WhatsApp in-app browser: WA4A (Android) / WAiOS (iOS); older builds "WhatsApp/".
  if (/\b(WA4A|WAiOS)\/|WhatsApp/i.test(s)) return 'whatsapp';
  if (/\bTelegram\b|TgWebView/i.test(s)) return 'telegram';
  // LinkedIn: iOS uses WKWebView tagged "LinkedInApp"; Android hands off to the
  // default browser (not a trapping webview), so it usually won't reach here.
  if (/LinkedInApp/i.test(s)) return 'linkedin';
  // X/Twitter: modern builds do NOT self-identify — only legacy "Twitter" token
  // is catchable; most X in-app traffic falls through to the generic check below.
  if (/\bTwitter\b|TwitterAndroid/i.test(s)) return 'twitter';
  if (/\bLine\//i.test(s)) return 'line';
  if (/Snapchat/i.test(s)) return 'snapchat';
  if (/MicroMessenger\//i.test(s)) return 'wechat';
  if (/Pinterest/i.test(s)) return 'pinterest';

  // Generic Android WebView marker: "; wv)". A raw webview, no install UI. We do
  // NOT apply the iOS "no Safari/ suffix" heuristic here: Chrome/Edge/Firefox on
  // iOS are WebKit shells that omit Safari/ too, and they CAN add to Home Screen
  // — flagging them as trapped webviews would be a false positive.
  if (/; wv\)/i.test(s)) return 'generic-webview';
  return null;
}

// ---------------------------------------------------------------------------
// Browser identity
// ---------------------------------------------------------------------------

function braveSync(): boolean {
  // navigator.brave exists synchronously in Brave; isBrave() is async but the
  // object's mere presence is a reliable-enough sync signal for strategy choice.
  return hasWindow() && 'brave' in navigator && typeof (navigator as Navigator & { brave?: unknown }).brave === 'object';
}

export function detectEngine(): Engine {
  if (!hasWindow()) return 'unknown';
  const p = detectPlatform();
  // On iOS EVERY browser is WebKit — Apple forces it. Treat accordingly.
  if (p === 'ios' || p === 'ipados') return 'webkit';
  const s = ua();
  if (/Gecko\/|Firefox\//.test(s) && !/like Gecko/.test(s.replace('Gecko/', ''))) {
    if (/Firefox\//.test(s)) return 'gecko';
  }
  if (/Chrome|Chromium|CriOS|EdgA?|SamsungBrowser|OPR|Brave/.test(s)) return 'chromium';
  if (/Safari/.test(s) && !/Chrome/.test(s)) return 'webkit';
  return 'unknown';
}

export function detectBrowser(): BrowserName {
  if (!hasWindow()) return 'unknown';
  const s = ua();
  const p = detectPlatform();

  // iOS: UI brand differs, engine is always WebKit.
  if (p === 'ios' || p === 'ipados') {
    if (/CriOS/.test(s)) return 'chrome-ios';
    if (/EdgiOS/.test(s)) return 'edge-ios';
    if (/FxiOS/.test(s)) return 'firefox-ios';
    return 'safari';
  }

  // Android / desktop Chromium family — order matters (Edge/Opera/Samsung carry
  // "Chrome" too, so check the specific brands first).
  if (braveSync()) return 'brave';
  if (/EdgA?\//.test(s)) return 'edge';
  if (/OPR\/|Opera/.test(s)) return 'opera';
  if (/SamsungBrowser/.test(s)) return 'samsung';
  if (/Firefox\/|FxiOS/.test(s)) return 'firefox';
  if (/; wv\)/.test(s)) return 'webview';
  if (/Chrome|Chromium/.test(s)) return 'chrome';
  if (/Safari/.test(s)) return 'safari';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Capabilities — derived, not sniffed piecemeal
// ---------------------------------------------------------------------------

function computeCapabilities(
  platform: Platform,
  engine: Engine,
  browser: BrowserName,
  inApp: InAppBrowser,
): InstallCapabilities {
  const isInAppBrowser = inApp !== null;
  const supportsInstalledRelatedApps =
    hasWindow() && typeof (navigator as Navigator & { getInstalledRelatedApps?: unknown }).getInstalledRelatedApps === 'function';

  // beforeinstallprompt is Chromium-only, and never inside a webview/in-app
  // browser, and never on iOS (all WebKit). Firefox (gecko) never fires it.
  // Opera mobile is unreliable (2024 field reports) — we still *try*, but don't
  // promise one-tap for it.
  const mayFireBeforeInstallPrompt =
    engine === 'chromium' &&
    !isInAppBrowser &&
    browser !== 'firefox' &&
    browser !== 'webview' &&
    platform !== 'ios' &&
    platform !== 'ipados';

  // Manual "Add to Home Screen" exists in every first-party browser (iOS Safari,
  // all Android browsers) but NOT inside social webviews.
  const supportsAddToHomeScreen = !isInAppBrowser && browser !== 'webview';

  // "One tap here" = the deferred prompt path is genuinely available now. (Even
  // then the browser sheet adds its own confirm — realistically ~2 taps — but
  // from OUR UI it is a single button press, which is the product goal.)
  const canOneTapInstallHere = mayFireBeforeInstallPrompt;

  return {
    mayFireBeforeInstallPrompt,
    canOneTapInstallHere,
    supportsAddToHomeScreen,
    isInAppBrowser,
    supportsInstalledRelatedApps,
    supportsStandaloneDetection: hasWindow() && typeof window.matchMedia === 'function',
  };
}

// ---------------------------------------------------------------------------
// The one call everything uses
// ---------------------------------------------------------------------------

export function getEnvironment(): InstallEnvironment {
  const platform = detectPlatform();
  const engine = detectEngine();
  const browser = detectBrowser();
  const inApp = detectInAppBrowser();
  const displayMode = getDisplayMode();
  const isNativeShell = detectNativeShell();
  const isStandalone = detectStandalone();
  const capabilities = computeCapabilities(platform, engine, browser, inApp);

  return { platform, engine, browser, inApp, displayMode, isStandalone, isNativeShell, capabilities, ua: ua() };
}
