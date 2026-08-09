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
  /** Open Razorpay in-page. Only where a popup and a redirect both work. */
  | 'inline'
  /** Render a real <a target="_blank"> to `/go`. Never a scripted popup. */
  | 'ios_link_handoff'
  /** window.open inside the gesture, then point it at `/go`. */
  | 'popup_handoff';

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

  // Scripted popups are ignored by WKWebView while the wrapper paints a blank
  // view over the app, so the student sees white. A real link is honoured.
  if (s.iosStoreBuild) return 'ios_link_handoff';

  // THE FIX. An installed iOS PWA has the same popup and navigation limits as
  // the WKWebView wrapper, and until now was the one iOS surface that got the
  // inline modal. 0 payments in 21 attempts.
  if (s.ios && s.standalone) return 'ios_link_handoff';

  // Android's TWA does honour window.open inside a user gesture, and opening
  // the tab synchronously is what keeps it from being popup-blocked.
  if (s.androidStoreBuild) return 'popup_handoff';

  // Desktop, mobile browser tabs, and installed Android PWAs. Android's
  // installed PWA is deliberately NOT handed off: it produced the only
  // completed in-app payment we have, so sending it to a browser would break
  // the one path that demonstrably works.
  return 'inline';
}

/** True when checkout must leave this context to have any chance of working. */
export function needsBrowserHandoff(s: PaymentSurfaceSignals): boolean {
  return paymentSurface(s) !== 'inline';
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
