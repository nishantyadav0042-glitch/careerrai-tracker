'use client';

import { needsCheckoutHandoff, checkoutHandoffUrl } from '@/lib/payment-origin';
import type { PaymentReturnKey } from '@/lib/payment-return';

// The one place the three checkout surfaces ask "may I transact here?".
//
// Written once rather than three times on purpose: membership-card,
// unlock-buddy-sheet and book-session-card have drifted apart before (only two
// of them emit payment_order_created; only two share the duplicate-order
// guard), and a payment rule that lives in three copies is a payment rule that
// will hold in two of them.

export type OriginGate =
  /** This origin can transact — carry on and mint the order here. */
  | { move: false }
  /** The page is navigating to the checkout origin. Stop what you were doing. */
  | { move: true };

/**
 * Move the student to the checkout origin if this one cannot transact.
 *
 * Returns `{ move: true }` ONLY when a navigation has actually been issued, so
 * a caller that returns on `move` can never leave the student on a dead button:
 * every failure path below resolves to `{ move: false }` and lets the existing
 * checkout run exactly as it does today. A hand-off that cannot be minted is a
 * worse outcome than a checkout that might be blocked — the block at least
 * shows the student a Razorpay error, while a silent no-op shows them nothing.
 */
export async function ensureTransactableOrigin(dest: PaymentReturnKey): Promise<OriginGate> {
  if (typeof window === 'undefined') return { move: false };
  if (!needsCheckoutHandoff(window.location.origin)) return { move: false };

  try {
    const res = await fetch('/api/install/handoff', { method: 'POST' });
    if (!res.ok) return { move: false };
    const { url } = (await res.json()) as { url?: string };
    // /api/install/handoff answers with `/app?k=<token>`; the token is what we
    // need, not its path — this hand-off lands on the payment continue screen,
    // not the install entry point.
    const token = new URLSearchParams((url ?? '').split('?')[1] ?? '').get('k');
    if (!token) return { move: false };
    window.location.assign(checkoutHandoffUrl(token, dest));
    return { move: true };
  } catch {
    return { move: false };
  }
}
