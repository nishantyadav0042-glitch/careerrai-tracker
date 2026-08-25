// ── Where checkout is allowed to open ───────────────────────────────────────
//
// Measured on the live database, 9 Aug 2026. Every payment attempt we have
// telemetry for, split by where the app was running:
//
//   iOS, INSTALLED PWA    7 opened · 7 dismissed · 0 paid   ← 3 people, 21 taps
//   Android, installed    13 opened · 7 dismissed · 1 paid
//   iOS, browser tab      1 opened · 1 PAID
//
// And the time each person spent inside the Razorpay window before closing it:
//
//   all 14 dismissals   5.6s  7.3s  7.3s  7.9s  8.0s  8.1s  9.1s
//                       9.5s  10.9s 11.8s 12.3s 15.7s 27.8s
//   the one success     67.0s
//
// Nobody who spent under 28 seconds paid, and entering a UPI PIN takes about a
// minute. A six-second exit is not a student reconsidering the price — it is a
// student looking at a checkout that will not respond and closing it. One of
// them (Ujjwal) tried fourteen times across three and a half hours.
//
// The cause is structural, not a Razorpay bug. Inside an iOS home-screen PWA,
// `window.open` to another origin is blocked and any navigation away tears down
// the PWA context — so the moment Razorpay's modal needs a popup or a redirect
// for UPI, netbanking or a 3-D Secure step, it dead-ends. The modal paints and
// then does nothing, which is exactly what a six-second dismissal looks like.
//
// The escape hatch already existed and already worked — `/go` mints a one-time
// signed-in link into the real browser. It was only ever wired to the STORE
// builds (the Android TWA and the iOS App Store wrapper). A home-screen PWA is
// neither, so it "fell straight through to inline Razorpay", in the words of
// the comment that sat above the bug.
//
// This module is the one place that decides, and it is pure so the decision can
// be tested without a phone.

export type PaymentSurface =
  /** Open Razorpay in-page. Only where the modal is known to work. */
  | 'inline'
  /**
   * Razorpay in FULL-PAGE REDIRECT mode: no modal, no popup, no new tab, no
   * hand-off — the page itself navigates to Razorpay and comes back via
   * callback_url. Same order id, so reconciliation is untouched.
   */
  | 'redirect';

// ── The hand-off is gone ────────────────────────────────────────────────────
//
// 'ios_link_handoff' and 'popup_handoff' both ended on /go, a page that asked
// the student to escape to a browser — and on iOS, to do it BY HAND via the
// share sheet. Its own measured result is in the /go source: 160 tokens
// minted, 7 consumed. A 96% drop-off before Razorpay was ever reached.
//
// Redirect mode removes the entire class of problem. There is nothing to
// escape to, nothing to copy, and no second tap: the page navigates to
// Razorpay and comes back. Founder, 25 Aug: "there should not be this option
// of copy my payment link — you should directly redirect to razorpay".

export interface PaymentSurfaceSignals {
  /** This tab IS the browser we escaped into — checkout must run here. */
  escapedTab: boolean;
  /** Running inside the iOS App Store wrapper (WKWebView). */
  iosStoreBuild: boolean;
  /** Running inside the Android Play wrapper (TWA). */
  androidStoreBuild: boolean;
  /** iPhone/iPad, by user agent. */
  ios: boolean;
  /** Launched from the home screen rather than a browser tab. */
  standalone: boolean;
}

/**
 * `escapedTab` is checked first and beats everything.
 *
 * Without that, the tab we just handed the student would compute "still iOS,
 * still needs a handoff" and offer to escape to a browser from inside the
 * browser — an infinite loop with a Pay button at every step.
 */
export function paymentSurface(s: PaymentSurfaceSignals): PaymentSurface {
  if (s.escapedTab) return 'inline';

  // The WKWebView wrapper cannot open the modal (scripted popups are ignored
  // and the wrapper paints a blank view over the app). It CAN navigate, which
  // is all redirect mode needs.
  if (s.iosStoreBuild) return 'redirect';

  // An installed iOS PWA has the same popup limits as the WKWebView wrapper,
  // so the inline modal never worked here: 0 payments in 21 attempts.
  //
  // BUT IT IS NOT THE SAME AS THE WRAPPER, and treating it as such was its own
  // bug. A WKWebView honours a real anchor and escapes to Safari; an installed
  // PWA does NOT — target="_blank" navigates INSIDE the app. So the hand-off
  // link landed on /go within the PWA, which then asked the student to tap
  // share and choose "Open in Safari" by hand. Three taps and a system menu to
  // buy a ₹299 session (founder, on an iPhone, 25 Aug).
  //
  // Redirect mode needs no popup and no escape: the page navigates to
  // Razorpay's hosted checkout and returns through callback_url. One tap, and
  // the SAME order id, so the webhook and activate-payment path do not change.
  if (s.ios && s.standalone) return 'redirect';

  // Android's TWA does honour window.open, but that only ever moved the
  // student to /go and the same hand-off drop-off. Navigating in place is one
  // tap and needs no popup permission at all.
  if (s.androidStoreBuild) return 'redirect';

  // Desktop, mobile browser tabs, and installed Android PWAs. Android's
  // installed PWA is deliberately NOT handed off: it produced the only
  // completed in-app payment we have, so sending it to a browser would break
  // the one path that demonstrably works.
  return 'inline';
}

/**
 * Kept as a named FALSE so any caller still asking the question gets the right
 * answer: nothing hands off any more. Every surface either opens the modal in
 * place or navigates to Razorpay in place.
 */
export function needsBrowserHandoff(_s: PaymentSurfaceSignals): boolean {
  return false;
}

/** True when Razorpay should navigate the page instead of opening a modal. */
export function usesRedirectCheckout(s: PaymentSurfaceSignals): boolean {
  return paymentSurface(s) === 'redirect';
}

/**
 * Did the hand-off actually reach a browser, or are we still inside the app?
 *
 * `/go` used to assume the answer was always yes and call `markPaymentTab()`
 * unconditionally. On iOS that assumption is false and it is self-destructive:
 * a `target="_blank"` link opened from a home-screen PWA loads in the SAME PWA
 * window, so `/go` ran inside the app, marked it "the real browser payment
 * tab", and thereby switched that window to inline Razorpay — the one context
 * on iOS that cannot complete a payment. The escape hatch disabled itself and
 * then handed the student the broken path.
 *
 * The evidence, from the live database on 9 Aug:
 *
 *   160 hand-off tokens minted · 7 ever consumed          (4.4%)
 *   4 of those 7 are one student, Ujjwal, on iOS
 *   his token consumed 21:06:10 → order created INLINE 21:06:20 → dismissed 8s
 *   every event he ever produced reports display_mode 'standalone'
 *
 * If `/go` had genuinely opened Safari, the events after it would say
 * 'browser'. Not one ever did.
 *
 * `navigator.standalone === true` is the precise test. It is an iOS-only
 * property, set only for a home-screen web app window: a real Safari tab and an
 * SFSafariViewController both report false or undefined. It must NOT be
 * confused with the `display-mode: standalone` media query, which an Android
 * Chrome Custom Tab also matches — a Custom Tab IS a real browser where
 * Razorpay works, and refusing to mark it would break the Android path that
 * currently converts.
 */
export function handoffReachedBrowser(nav: unknown): boolean {
  if (!nav || typeof nav !== 'object') return true;
  return (nav as { standalone?: unknown }).standalone !== true;
}

/**
 * What the student reads while being sent to their browser.
 *
 * It must not read like a failure. Nothing has gone wrong from where they are
 * standing — they tapped Pay and are being taken somewhere to pay — and a
 * student who thinks the app is broken does not come back for the second tap.
 */
export const HANDOFF_COPY = {
  ready: 'One more tap — payment opens securely in your browser:',
  noLink: 'To finish, open careerrai.in in your browser and tap Pay there:',
  button: 'Continue to payment →',
} as const;
