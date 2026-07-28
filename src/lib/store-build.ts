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
export function launchedFromAndroidApp(): boolean {
  try { return document.referrer.startsWith('android-app://'); }
  catch { return false; }
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
 * Sync-open a browser tab INSIDE the user gesture (so it isn't popup-blocked),
 * then point it at a one-time logged-in hand-off (`/go`) that lands the student
 * on `dest` (the paywall) in the real browser, already signed in, where web
 * Razorpay is allowed. Returns false if a tab couldn't be opened (the caller
 * then shows a manual "open careerrai.in in your browser" fallback — never
 * navigates the wrapper itself, which would loop).
 */
export async function escapeToBrowserForPayment(dest = '/student/buddy'): Promise<boolean> {
  let win: Window | null = null;
  try { win = window.open('about:blank', '_blank'); } catch { win = null; }
  if (!win) return false;

  let token: string | null = null;
  try {
    const res = await fetch('/api/install/handoff', { method: 'POST' });
    if (res.ok) {
      const { url } = (await res.json()) as { url?: string };
      const q = url?.split('?')[1];
      if (q) token = new URLSearchParams(q).get('k');
    }
  } catch { /* handled below */ }

  // Without a token /go can't sign them in, and they'd land on a login screen
  // in a strange tab with no idea why. Better to close it and let the caller
  // tell them what to do.
  if (!token) {
    try { win.close(); } catch { /* already gone */ }
    return false;
  }

  const target = new URL('/go', window.location.origin);
  target.searchParams.set('k', token);
  target.searchParams.set('dest', dest);
  win.location.href = target.toString();
  return true;
}
