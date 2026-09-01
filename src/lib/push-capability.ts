// ── THE authority on "can THIS surface receive a CareerRai push?" ───────────
//
// Before this file the question was answered inline, three times, in three
// components — standalone-notif-ask, push-healer and push-toggle each carried
// their own isStandalone()/isIOS() pair. Three copies of one capability rule is
// how the 1 Sep audit found a latent defect that only one of them had:
//
//   `if (!isStandalone()) return;`   ← correctly skips a browser tab
//   `if (isIOS()) return;`           ← intended for the App Store WKWebView…
//
// …but an iOS HOME SCREEN PWA is standalone (navigator.standalone === true),
// so it passed the first check and was then thrown away by the second. That is
// the ONE iOS surface that provably works: all six of our
// `web.push.apple.com` subscriptions live there. The blanket iOS skip was
// silently blocking the only iOS path we have.
//
// (Honest status of that defect as of 1 Sep: correct by code reading, and NOT
// yet observed firing in production — every `push_ask_skipped why=ios_wrapper`
// event so far carries context `ios_app`, the real wrapper. With 13 iOS PWA
// students total, one day of telemetry cannot see it. It is fixed here because
// it blocks the only working iOS surface, not because it has bitten yet.)
//
// This module is a LEAF: it imports nothing and reads nothing global in its
// pure half, so every branch is testable. If you are about to write another
// isStandalone()/isIOS() pair anywhere, stop and call this instead.

/** What kind of surface the student is actually looking at. */
export type PushSurface =
  | 'ios_wrapper'   // App Store WKWebView — NO Web Push API exists here, ever
  | 'ios_pwa'       // Safari Home Screen PWA — Apple Web Push, iOS 16.4+
  | 'standalone'    // installed PWA on Android/desktop
  | 'browser_tab'   // a plain tab, any platform
  | 'unsupported';  // no Notification/ServiceWorker/PushManager at all

/**
 * Why we cannot ask, and what the student could do about it.
 *
 * `remedy` is the whole point of separating this from a boolean: "cannot
 * receive" is not one state. A browser tab needs an install; the iOS wrapper
 * needs a DIFFERENT install on a different surface; an ancient browser needs
 * nothing because nothing will help.
 */
export type PushBlockReason = 'ios_wrapper' | 'not_standalone' | 'unsupported';
export type PushRemedy = 'add_to_home_screen' | 'install_app' | 'none';

export interface PushCapability {
  surface: PushSurface;
  /** True only when the Web Push API can genuinely work on this surface. */
  canReceive: boolean;
  reason?: PushBlockReason;
  remedy: PushRemedy;
}

export interface SurfaceSignals {
  /** display-mode:standalone OR navigator.standalone — an installed surface. */
  standalone: boolean;
  /** The device is an iPhone/iPad. */
  isApple: boolean;
  /** The `cr_store` cookie says this is the App Store build. */
  isStoreWrapper: boolean;
  /** Notification + serviceWorker + PushManager all present. */
  hasPushApis: boolean;
}

/**
 * Pure, exported for tests. Order is load-bearing and each step is a distinct
 * production population — see the 1 Sep reach audit.
 */
export function pushCapabilityFrom(s: SurfaceSignals): PushCapability {
  // The WKWebView wrapper is checked FIRST and independently of `standalone`.
  // A WKWebView never matches display-mode:standalone, so it would otherwise
  // fall into 'not_standalone' and be told to install an app it already has.
  if (s.isStoreWrapper && s.isApple) {
    return { surface: 'ios_wrapper', canReceive: false, reason: 'ios_wrapper', remedy: 'add_to_home_screen' };
  }
  if (!s.hasPushApis) {
    return { surface: 'unsupported', canReceive: false, reason: 'unsupported', remedy: 'none' };
  }
  if (!s.standalone) {
    // Deliberate product rule, not a limitation: permission is only ever asked
    // inside an installed surface. An iPhone in a Safari tab is told to add to
    // Home Screen; everyone else is told to install.
    return {
      surface: 'browser_tab',
      canReceive: false,
      reason: 'not_standalone',
      remedy: s.isApple ? 'add_to_home_screen' : 'install_app',
    };
  }
  // Standalone AND Apple AND not the wrapper === Safari Home Screen PWA.
  // THIS CAN RECEIVE. It is the only iOS surface that ever has.
  if (s.isApple) return { surface: 'ios_pwa', canReceive: true, remedy: 'none' };
  return { surface: 'standalone', canReceive: true, remedy: 'none' };
}

/** Read the live browser signals. Returns null during SSR. */
export function readSurfaceSignals(): SurfaceSignals | null {
  if (typeof window === 'undefined') return null;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const ua = nav.userAgent || '';
  return {
    standalone: Boolean(window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true),
    // iPadOS 13+ reports itself as MacIntel with touch points — the only
    // reliable tell, and the same test store-build.ts already relies on.
    isApple: /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1),
    isStoreWrapper: /(?:^|;\s*)cr_store=ios(?:;|$)/.test(document.cookie),
    hasPushApis: 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window,
  };
}
