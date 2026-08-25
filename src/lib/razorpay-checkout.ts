// Client-side Razorpay loader, shared by every checkout surface so there is
// exactly ONE place that pulls in the SDK.

export type RazorpayInstance = {
  open: () => void;
  on: (event: string, handler: (payload: unknown) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

// 15s cap: on a weak Indian mobile connection this request can hang without
// ever firing onerror, which would leave the buy button stuck on "Starting…"
// with every plan disabled and no way out but a reload.
const SCRIPT_TIMEOUT_MS = 15_000;

export function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) return resolve(true);
    let settled = false;
    const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => done(true);
    script.onerror = () => done(false);
    setTimeout(() => done(false), SCRIPT_TIMEOUT_MS);
    document.body.appendChild(script);
  });
}

/** Human-readable reason from a Razorpay `payment.failed` payload. */
export function failureMessage(payload: unknown): string {
  const err = (payload as { error?: { description?: string } } | null)?.error;
  return err?.description ?? 'That payment didn’t go through. You can try another method.';
}

// ── Redirect mode ───────────────────────────────────────────────────────────
//
// An installed iOS PWA blocks the popups and iframes Razorpay's modal needs,
// and — unlike the WKWebView wrapper — it cannot escape to Safari with an
// anchor either. Redirect mode is the way out: Razorpay navigates the page to
// its own hosted checkout and returns through callback_url.
//
// WHY THIS IS SAFE FOR MONEY: it is the SAME order id. The webhook still fires
// on that order, student_payments is still looked up by razorpay_order_id, and
// activate-payment is untouched. Only the presentation changes — a full-page
// navigation instead of a modal.
//
// The `handler` callback CANNOT fire in this mode: the page is gone before
// Razorpay would call it. Anything a surface does in `handler` must therefore
// also happen on the callback_url landing page, which is why callers pass a
// destination that already knows how to confirm a purchase.

export interface RedirectCheckoutOptions {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: Record<string, string | undefined>;
  notes?: Record<string, string>;
  /** Where Razorpay sends the student afterwards. Must be absolute. */
  callbackUrl: string;
  themeColor?: string;
}

/**
 * Build the option bag for a full-page redirect checkout.
 *
 * Kept as a pure function so the shape is testable without a browser — the
 * three checkout surfaces all pass through here, so they cannot drift into
 * three subtly different redirect configs.
 */
export function redirectCheckoutOptions(o: RedirectCheckoutOptions): Record<string, unknown> {
  return {
    key: o.keyId,
    order_id: o.orderId,
    amount: o.amount,
    currency: o.currency,
    name: o.name,
    description: o.description,
    prefill: o.prefill ?? {},
    notes: o.notes ?? {},
    theme: { color: o.themeColor ?? '#0f766e' },
    // The two lines that make it a navigation rather than a modal.
    redirect: true,
    callback_url: o.callbackUrl,
  };
}

/** Absolute callback URL for a surface, preserving where the student was. */
export function checkoutCallbackUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  const url = new URL(path, window.location.origin);
  // Marks the return leg so the landing page can confirm rather than re-offer.
  url.searchParams.set('paid', '1');
  return url.toString();
}
