import type { PaymentSurfaceSignals } from '@/lib/payment-surface';

// Store-build detection + external-browser payment escape.
//
// The Play (Android TWA) and iOS (WKWebView) STORE builds launch with a
// `?source=` param on their start URL (twa / ios). We persist that once, so we
// can — ONLY inside those wrapper builds — route a payment out to the REAL
// browser instead of opening an in-app card sheet. Rationale: Apple 3.1.1 /
// Play Billing reject an in-app web card sheet that unlocks app features, but a
// payment completed in the real browser for a genuine live 1:1 mentorship
// service is the compliant path (the service is person-to-person / real-world).
//
// Everywhere else — the web, and a browser-installed PWA — in-app Razorpay runs
// inline as normal (no redirect, no conversion loss). Current users never
// launch with ?source=twa|ios, so isStoreBuild() is false for them today.

const FLAG = 'cr_store_build';
// Per-TAB marker, set by /go on the tab we escaped INTO. sessionStorage is
// scoped to one tab, so it can never leak back into the wrapper.
const ESCAPED = 'cr_payment_tab';

/**
 * Canonicalise a `?source=` value to a store platform, or null.
 *
 * THIS IS THE ONLY LIST. The install-CTA suppressor (lib/install/detect.ts)
 * briefly grew its own parallel list with different accepted values
 * ('ios-app'/'android-app', never matching proxy.ts's 'ios'/'twa' cookie) —
 * one concept, two implementations, already diverged. Both layers now call
 * this. The aliases stay accepted so no start URL ever configured from any
 * doc version becomes a silent no-op; they normalise to the canonical value
 * the `cr_store` cookie and its regex consumers expect.
 *
 * Pure and exported for tests.
 */
export function normalizeStoreSource(v: string | null | undefined): 'twa' | 'ios' | null {
  switch (v) {
    case 'twa':
    case 'android-app': return 'twa';
    case 'ios':
    case 'ios-app': return 'ios';
    default: return null;
  }
}

/**
 * The platform family a user-agent DEFINITELY belongs to, or 'unknown'.
 *
 * 'unknown' is a real answer, not a failure: it means "no evidence either
 * way", and every caller below treats it as permission rather than as proof
 * against a wrapper. A WKWebView with a custom applicationNameForUserAgent, a
 * stripped UA behind a privacy proxy, or a bot all land here, and none of them
 * should be able to un-mark a store build.
 *
 * Pure and exported so every branch is covered by tests.
 */
export type UaFamily = 'android' | 'apple' | 'other' | 'unknown';

export function userAgentFamily(ua: string | null | undefined): UaFamily {
  if (!ua || !ua.trim()) return 'unknown';
  // ANDROID IS TESTED FIRST and the order is load-bearing: Android's UA string
  // is "(Linux; Android 13; ...)", so a Linux test would claim it as a desktop.
  if (/Android/i.test(ua)) return 'android';
  // "Mac OS X" catches iOS too — an iPhone UA reads "CPU iPhone OS 17_0 like
  // Mac OS X" — which is deliberate. Every Apple surface is one family here,
  // because the server cannot tell an iPad in desktop mode from a Mac: that
  // needs navigator.maxTouchPoints, which exists only in the browser and is
  // exactly why isIosStoreBuildFrom takes it as a signal.
  if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua)) return 'apple';
  if (/Windows|CrOS|X11|Linux/i.test(ua)) return 'other';
  return 'unknown';
}

/**
 * Is this `?source=` value believable coming from THIS device?
 *
 * The cr_store cookie disables inline Razorpay and routes payment out to the
 * real browser. That is correct inside the store wrappers and wrong everywhere
 * else, but until now ANY request carrying `?source=ios` got marked — so one
 * shared link that happened to keep the query string marked a plain browser as
 * a store build for ten years. Nobody reports that as a bug; it just quietly
 * costs conversions.
 *
 * THE ASYMMETRY IS THE WHOLE DESIGN. Refusing a genuine wrapper is far worse
 * than marking a stray browser: an unmarked iOS wrapper opens Razorpay inline
 * in a WKWebView, which is both the Apple 3.1.1 posture this file exists to
 * hold and a payment path that is 100% broken there (window.open is ignored —
 * see the 31 Jul fix). So this refuses ONLY on positive evidence that the
 * device belongs to the other platform, and an unreadable UA always passes.
 *
 * Known and accepted: a Mac desktop carrying a stray ?source=ios link still
 * gets marked, because 'apple' is one family (see above). That is the price of
 * never risking an iPad-shaped wrapper, and Macs are a rounding error against
 * an Android-majority student base.
 */
export function shouldStampStoreCookie(source: 'twa' | 'ios', ua: string | null | undefined): boolean {
  const family = userAgentFamily(ua);
  if (family === 'unknown') return true;          // no evidence — never punish a wrapper
  return source === 'ios' ? family === 'apple' : family === 'android';
}

/**
 * True when an ALREADY-SET cr_store cookie contradicts the device holding it.
 *
 * Gating new stamps does nothing for the ten-year cookies already issued, and
 * those are the actual harm in the wild today. This is what lets the proxy
 * clear one. Same asymmetry: only a definite contradiction counts, so 'apple'
 * and 'unknown' never clear an iOS mark.
 */
export function storeCookieContradictsDevice(
  cookie: 'twa' | 'ios' | null,
  ua: string | null | undefined,
): boolean {
  if (!cookie) return false;
  return !shouldStampStoreCookie(cookie, ua);
}

/** Server-set cookie (see proxy.ts) — survives the logged-out login redirect. */
export function storeCookieValue(): 'twa' | 'ios' | null {
  try {
    const m = /(?:^|;\s*)cr_store=(twa|ios)(?:;|$)/.exec(document.cookie);
    return (m?.[1] as 'twa' | 'ios' | undefined) ?? null;
  } catch { return null; }
}

function hasStoreCookie(): boolean {
  return storeCookieValue() != null;
}

/**
 * Chrome sets `android-app://<package>` as the referrer for the launch
 * navigation of a TWA. Definitive proof we're inside the Play wrapper, and it
 * needs no param, cookie or storage to survive.
 */
/**
 * Did this navigation come from OUR Android wrapper?
 *
 * The referrer alone is not evidence, and treating it as evidence was a real
 * conversion bug. `android-app://` is set when a link is opened from ANY
 * Android app — WhatsApp, Instagram, Gmail — and WhatsApp is our main outreach
 * channel. `isStoreBuild()` called this branch "Definitive", so every Android
 * student who tapped a careerrai.in link in WhatsApp was treated as a Play
 * Store wrapper user and pushed out of inline checkout into the browser-escape
 * flow, which they never needed and which lands 4% of the time.
 *
 * Verified 9 Aug: all three Android students who ever consumed a hand-off token
 * had ZERO `twa` sessions — they were browser + standalone only. They were
 * WhatsApp arrivals, escaped for no reason. And the Android app was not even on
 * the Play Store on any of those dates.
 *
 * The `cr_store` cookie is the signal that means something: the server stamps
 * it from `?source=twa` on the wrapper's start URL and it survives the
 * logged-out redirect that eats the query param. The referrer now only
 * CORROBORATES it, so a stray WhatsApp click can never stand in for a launch.
 */
export function launchedFromAndroidApp(): boolean {
  try {
    if (!document.referrer.startsWith('android-app://')) return false;
    return storeCookieValue() === 'twa';
  } catch { return false; }
}

/** Call once on app load: if launched from a store wrapper, remember it. */
export function markStoreBuildFromUrl(): void {
  try {
    const src = normalizeStoreSource(new URLSearchParams(window.location.search).get('source'));
    if (src || hasStoreCookie() || launchedFromAndroidApp()) {
      localStorage.setItem(FLAG, '1');
    }
  } catch { /* storage blocked — treat as non-store, safe default */ }
}

/** The persisted store-build flag, shared with the install-CTA suppressor. */
export function hasStoreBuildFlag(): boolean {
  try { return localStorage.getItem(FLAG) === '1'; } catch { return false; }
}

/** Mark THIS tab as the real-browser payment tab (called by /go). */
export function markPaymentTab(): void {
  try { sessionStorage.setItem(ESCAPED, '1'); } catch { /* storage blocked */ }
}

/**
 * Read the five browser facts that decide where checkout may open, so
 * `lib/payment-surface` can stay pure and testable without a phone.
 *
 * This is the ONLY place a checkout surface should learn about its environment.
 * The iOS home-screen PWA went unpaid for weeks precisely because each surface
 * asked its own question — `isStoreBuild()` with an iOS branch nested inside —
 * and a home-screen PWA answers no to both, so it fell through to the inline
 * modal that cannot complete a payment there.
 */
export function readPaymentSurfaceSignals(): PaymentSurfaceSignals {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  let escapedTab = false;
  try { escapedTab = sessionStorage.getItem(ESCAPED) === '1'; } catch { /* storage blocked */ }

  const ios = !!nav && (
    /iPad|iPhone|iPod/.test(nav.userAgent)
    // iPadOS 13+ reports itself as a Mac; the touch-point count is what still
    // separates an iPad from a desktop Safari that pays perfectly well inline.
    || (/Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1)
  );

  const standalone = typeof window !== 'undefined' && (
    !!window.matchMedia?.('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );

  return {
    escapedTab,
    iosStoreBuild: isIosStoreBuild(),
    androidStoreBuild: isStoreBuild() && !isIosStoreBuild(),
    ios,
    standalone,
  };
}

/**
 * True only inside the actual store wrapper: the persisted flag AND currently
 * running standalone AND not the tab we already escaped into.
 *
 * That last condition is load-bearing on Android. A TWA *is* a Chrome Custom
 * Tab, so the tab we open for payment can still match `(display-mode:
 * standalone)`. Without a per-tab marker, checkout in the escape tab would
 * escape again — an endless chain of tabs where paying is impossible.
 */
export function isStoreBuild(): boolean {
  try {
    // The tab we escaped INTO is a real browser, whatever else says otherwise.
    // Checked first so payment always runs inline here.
    if (sessionStorage.getItem(ESCAPED) === '1') return false;

    // Definitive: this navigation came from the Android wrapper itself.
    if (launchedFromAndroidApp()) return true;

    // iOS store build: the cookie says 'ios'. Decided WITHOUT the standalone
    // check below, because a WKWebView never reports display-mode: standalone
    // — that media query matches installed PWAs, not native web views. With
    // the old standalone requirement this function was structurally false
    // inside the iOS wrapper, which meant the payment escape-to-browser (the
    // Apple 3.1.1 compliance path this file exists for) could never fire
    // there, and Razorpay's card sheet would have opened INLINE in front of an
    // App Review reviewer. The ESCAPED guard above still protects the
    // payment tab; the standalone check remains for the Android/TWA path,
    // where it is genuinely meaningful.
    if (storeCookieValue() === 'ios') return true;

    const flagged = hasStoreBuildFlag() || hasStoreCookie();
    if (!flagged) return false;

    const standalone = !!window.matchMedia?.('(display-mode: standalone)').matches
      || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
    return standalone;
  } catch {
    return false;
  }
}

/**
 * True only inside the **iOS** store wrapper, and only on positive evidence of
 * iOS — the cookie, or an Apple user-agent. Never true on Android.
 *
 * The asymmetry is deliberate. Android's payment escape works today and is what
 * Play review sees, so the iOS branch must be impossible to reach from an
 * Android device: `launchedFromAndroidApp()` short-circuits first, and no
 * Android UA can satisfy the test below. A "not Android, therefore iOS" default
 * would have put the Play build on an untested path — exactly the wrong risk to
 * take while a Play submission is open.
 */
export interface IosStoreSignals {
  storeBuild: boolean;
  androidReferrer: boolean;
  cookie: 'twa' | 'ios' | null;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}

/** The decision, pure and exported so every branch is covered by tests. */
export function isIosStoreBuildFrom(s: IosStoreSignals): boolean {
  if (!s.storeBuild) return false;
  if (s.androidReferrer) return false;             // definitive Android — leave alone
  if (s.cookie === 'twa') return false;            // definitive Android — leave alone
  // An Android USER-AGENT vetoes everything below, including the cookie. A
  // student who once opened a ?source=ios link on an Android phone carries a
  // cr_store=ios cookie, and without this line that phone would take the iOS
  // branch — breaking the "never true on Android" guarantee this function's
  // documentation makes, on the platform where the escape already works.
  if (/Android/i.test(s.userAgent)) return false;
  if (s.cookie === 'ios') return true;             // definitive iOS
  return /iPad|iPhone|iPod/.test(s.userAgent)      // iPhone / iPad
    || (s.platform === 'MacIntel' && s.maxTouchPoints > 1); // iPadOS desktop-mode UA
}

export function isIosStoreBuild(): boolean {
  try {
    return isIosStoreBuildFrom({
      storeBuild: isStoreBuild(),
      androidReferrer: launchedFromAndroidApp(),
      cookie: storeCookieValue(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
    });
  } catch { return false; }
}

/** Mint a one-time hand-off of the current session. Null if it can't be minted. */
async function mintHandoffToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/install/handoff', { method: 'POST' });
    if (!res.ok) return null;
    const { url } = (await res.json()) as { url?: string };
    const q = url?.split('?')[1];
    return q ? new URLSearchParams(q).get('k') : null;
  } catch { return null; }
}

/** The `/go` hand-off URL. Pure, so the query-building is testable. */
export function buildGoUrl(token: string, dest: string, origin: string): string {
  const target = new URL('/go', origin);
  target.searchParams.set('k', token);
  target.searchParams.set('dest', dest);
  return target.toString();
}

/**
 * A ready-to-tap signed-in checkout URL, for the **iOS** path.
 *
 * WKWebView ignores scripted popups — `window.open()` returns null while the
 * wrapper still paints a blank view over the app, so the student gets a white
 * screen and never sees the fallback underneath it. VERIFIED in production on
 * 31 Jul 2026: three Buy taps, three `pay_escape_browser {opened:false}`, and
 * zero rows in `pwa_session_handoff` — proving `escapeToBrowserForPayment`
 * returned at `if (!win)` before a token was ever minted.
 *
 * A real `<a target="_blank">` IS honoured by WKWebView's navigation delegate,
 * so on iOS we skip `window.open` entirely and hand the caller a URL to render
 * as a link. No popup, so no blank view can appear.
 */
export async function paymentHandoffUrl(dest = '/student/buddy'): Promise<string | null> {
  const token = await mintHandoffToken();
  if (!token) return null;
  return buildGoUrl(token, dest, window.location.origin);
}

/**
 * Sync-open a browser tab INSIDE the user gesture (so it isn't popup-blocked),
 * then point it at a one-time logged-in hand-off (`/go`) that lands the student
 * on `dest` (the paywall) in the real browser, already signed in, where web
 * Razorpay is allowed. Returns false if a tab couldn't be opened (the caller
 * then shows a manual "open careerrai.in in your browser" fallback — never
 * navigates the wrapper itself, which would loop).
 *
 * ANDROID / TWA ONLY as of 31 Jul 2026 — callers route iOS to
 * `paymentHandoffUrl` above. The window.open-first order is load-bearing here
 * (the tab must be opened inside the gesture) and is deliberately unchanged.
 */
export async function escapeToBrowserForPayment(dest = '/student/buddy'): Promise<boolean> {
  let win: Window | null = null;
  try { win = window.open('about:blank', '_blank'); } catch { win = null; }
  if (!win) return false;

  const token = await mintHandoffToken();

  // Without a token /go can't sign them in, and they'd land on a login screen
  // in a strange tab with no idea why. Better to close it and let the caller
  // tell them what to do.
  if (!token) {
    try { win.close(); } catch { /* already gone */ }
    return false;
  }

  win.location.href = buildGoUrl(token, dest, window.location.origin);
  return true;
}
