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

/** Call once on app load: if launched from a store wrapper, remember it. */
export function markStoreBuildFromUrl(): void {
  try {
    const src = new URLSearchParams(window.location.search).get('source');
    if (src === 'twa' || src === 'ios') localStorage.setItem(FLAG, '1');
  } catch { /* storage blocked — treat as non-store, safe default */ }
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
    if (sessionStorage.getItem(ESCAPED) === '1') return false;
    if (localStorage.getItem(FLAG) !== '1') return false;
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
