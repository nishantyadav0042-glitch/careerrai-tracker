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
