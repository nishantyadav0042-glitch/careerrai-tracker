'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PLANS, type PlanId } from '@/lib/plans';
import { trackMeta } from '@/lib/track';
import { track } from '@/lib/journey';
import { readPaymentSurfaceSignals } from '@/lib/store-build';
import { paymentSurface, usesRedirectCheckout } from '@/lib/payment-surface';
import { loadRazorpay, failureMessage, redirectCheckoutOptions, checkoutCallbackUrl } from '@/lib/razorpay-checkout';
import { catUrgencyLabel } from '@/lib/cat-countdown';
import { payFunnel } from '@/lib/payment-funnel-client';

// Buddy checkout. Two entry points share ONE payment path (useBuddyCheckout):
//  • BuddyBuyButtons — the price choice rendered DIRECTLY on the sales page,
//    so buying is a single tap straight into Razorpay (no intermediate sheet).
//  • UnlockBuddyButton — the older button → sheet flow, still used elsewhere.
// On a successful payment the Razorpay webhook flips is_premium and queues a
// buddy server-side; here we just reassure and refresh. If payments are flagged
// off (create-order 403) it degrades to the call flow.


function logCtaClick() {
  fetch('/api/engagement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'buddy_cta_click' }),
  }).catch(() => {});
}

/**
 * A plan CTA. An anchor inside the iOS wrapper, a button everywhere else.
 *
 * Same markup either way, so the student sees one control that behaves the
 * same on every platform — which is the whole point. Only the element differs,
 * because only iOS needs a real navigation to escape the webview.
 */
function PlanCta({
  onClick, disabled, className, analytics, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  className: string;
  analytics?: string;
  children: React.ReactNode;
}) {
  // Always a button. There used to be an anchor variant for the iOS hand-off,
  // which navigated to /go and asked the student to reach Safari by hand.
  // Every surface now pays in place, so there is nothing to navigate to.
  return (
    <button
      type="button"
      data-analytics={analytics}
      data-section="paywall"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  );
}

// The single payment path — order → Razorpay → reassure/refresh, with the
// payments-off (403) fallback to the call flow. Shared so there's ONE place
// that talks to Razorpay, never two copies drifting apart.
function useBuddyCheckout() {
  const router = useRouter();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [callMe, setCallMe] = useState(false);
  // Set when the store-build escape couldn't open a tab. Rendered as a real
  // tappable link — a plain "go to careerrai.in yourself" sentence is a dead
  // end, and reads as broken functionality to anyone reviewing the app.

  async function pay(planId: PlanId, fullName?: string) {
    // Intent captured first, in every path.
    track('buddy_plan_click', { plan: planId, price: PLANS[planId].display, amountPaise: PLANS[planId].amountPaise });
    // Store builds ONLY (Apple/Play): finish payment in the REAL browser for the
    // live 1:1 mentorship service — an in-app card sheet would be rejected. Web
    // and browser-installed PWA fall straight through to inline Razorpay below.
    logCtaClick();
    // ONE decision about where checkout may open — see lib/payment-surface.
    // The old shape tested isStoreBuild() with an iOS branch inside it, and an
    // installed iOS PWA is neither store build, so it "fell straight through to
    // inline Razorpay" (the comment above used to say exactly that). Measured
    // result of falling through: 0 payments in 21 attempts.
    setBusy(planId);
    setMessage(null);
    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      if (res.status === 403) { track('pay_blocked_flag_off', { plan: planId }); setCallMe(true); return; }

      const data = await res.json();
      if (!res.ok) {
        track('pay_order_failed', { plan: planId, status: res.status, error: data.error ?? null });
        setMessage(data.error ?? 'Checkout could not start. Please try again.');
        return;
      }

      if (data.free) {
        track('pay_free_unlock', { plan: planId });
        setMessage('Done! Setting up your 1:1 mentor — refreshing…');
        setTimeout(() => router.refresh(), 1500);
        return;
      }

      track('pay_order_created', { plan: planId, orderId: data.orderId, amount: data.amount });

      const ok = await loadRazorpay();
      if (!ok || !window.Razorpay) {
        track('pay_script_failed', { plan: planId, orderId: data.orderId });
        setMessage('The payment window failed to load. Please check your connection and try again.');
        return;
      }

      // The split event — see lib/payment-funnel. Proves a payment window was
      // actually shown, not merely that an order was minted.
      payFunnel('payment_checkout_opened', { plan: planId, surface: 'unlock_buddy' });

      // ── Installed iOS PWA: navigate, never a modal ─────────────────────
      // This surface blocks the popups the modal needs AND cannot escape to
      // Safari with an anchor, which is what produced the "tap share, choose
      // Open in Safari" dead end. Redirect mode keeps the SAME order id, so
      // the webhook and activate-payment path are unchanged.
      if (usesRedirectCheckout(readPaymentSurfaceSignals())) {
        payFunnel('payment_checkout_opened', { plan: planId, orderId: data.orderId, surface: 'unlock_buddy_redirect' });
        track('pay_redirect', { plan: planId, surface: 'unlock_buddy' });
        // Recorded BEFORE the navigation, because one line later this page is
        // gone and nothing client-side can report again. The server records
        // the matching 'returned' event, so a gap between the two is exactly
        // "left for Razorpay and never came back" — the failure that was
        // invisible while the modal era's events were the only ones we had.
        payFunnel('payment_checkout_navigating', { plan: planId, orderId: data.orderId, surface: 'unlock_buddy' });
        new window.Razorpay(redirectCheckoutOptions({
          keyId: data.keyId,
          orderId: data.orderId,
          amount: data.amount,
          currency: data.currency,
          name: 'CareerRai',
          description: `1:1 CAT mentorship (${PLANS[planId].label}) — live sessions with an IIM mentor`,
          prefill: data.prefill ?? (fullName ? { name: fullName } : undefined),
          themeColor: '#E8652D',
          callbackUrl: checkoutCallbackUrl('buddy'),
        })).open();
        return;
      }

      const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: 'CareerRai',
        description: `1:1 CAT mentorship (${PLANS[planId].label}) — live sessions with an IIM mentor`,
        // Server-resolved from the profile (create-order). Passing only `name`
        // made Razorpay ask a signed-in student for the phone number and email
        // we already hold — friction on the one screen where it costs the sale.
        prefill: data.prefill ?? (fullName ? { name: fullName } : undefined),
        theme: { color: '#E8652D' },
        modal: {
          // Razorpay keeps the sheet open on a failed attempt so they can retry
          // with another method; only a real close lands here.
          ondismiss: () => {
            payFunnel('payment_checkout_dismissed', { plan: planId, surface: 'unlock_buddy' });
            track('pay_dismissed', { plan: planId, orderId: data.orderId });
            setMessage('Payment cancelled. Your spot is still open — tap again when you’re ready.');
          },
        },
        handler: () => {
          track('pay_success_callback', { plan: planId, orderId: data.orderId });
          trackMeta('Purchase', { value: (data.amount ?? 0) / 100, currency: data.currency ?? 'INR', content_name: `1:1 CAT mentorship (${PLANS[planId].label})` }, data.orderId);
          setMessage('Payment received — confirming your buddy… 🎉');
          setTimeout(() => router.refresh(), 4000);
        },
      });
      rzp.on('payment.failed', (payload: unknown) => {
        const err = (payload as { error?: { reason?: string; step?: string } } | null)?.error;
        track('pay_failed', { plan: planId, orderId: data.orderId, reason: err?.reason ?? null, step: err?.step ?? null });
        setMessage(failureMessage(payload));
      });
      rzp.open();
      track('pay_checkout_opened', { plan: planId, orderId: data.orderId });
    } catch {
      track('pay_exception', { plan: planId });
      setMessage('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  // The iOS anchor navigates by itself; this only records the intent, so the
  // funnel still shows the tap. `opened:true` because the browser really does
  // open here — unlike the old two-tap flow, which logged opened:false and
  // then waited for a second tap that never came.
  return { pay, busy, message, callMe, setCallMe };
}


function CallMeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-stone-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="py-4 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl">✅</div>
          <h2 className="text-lg font-bold text-stone-900">All set! 🙌</h2>
          <p className="mt-1 text-sm text-stone-600">
            Our team will call you shortly to set up your IIM buddy. In the meantime, log today&apos;s session so your buddy has your data ready. 💪
          </p>
          <Button variant="primary" size="md" className="mt-5 w-full" onClick={onClose}>Got it</Button>
        </div>
      </div>
    </div>
  );
}

// The price choice, rendered inline on the sales page. One tap → Razorpay.
export function BuddyBuyButtons({ fullName, sticky = false }: { fullName?: string; sticky?: boolean }) {
  const { pay, busy, message, callMe, setCallMe } = useBuddyCheckout();
  const tap = (plan: PlanId) => pay(plan, fullName);

  if (sticky) {
    return (
      <>
        <PlanCta
          analytics="buy_tillcat_sticky"
          onClick={() => tap('tillcat')}
          disabled={busy !== null}
          className="block w-full rounded-2xl bg-stone-900 px-4 py-4 text-center text-white shadow-xl shadow-stone-900/25 transition-transform active:scale-[0.99] disabled:opacity-60"
        >
          <span className="text-[15px] font-bold">
            {busy === 'tillcat' ? 'Starting…' : 'Get my buddy till CAT · ₹2,999 →'}
          </span>
        </PlanCta>
        {message && <p className="mt-2 text-center text-xs font-medium text-stone-700">{message}</p>}
        {callMe && <CallMeModal onClose={() => setCallMe(false)} />}
      </>
    );
  }

  return (
    <div>
      {/* Hero — one payment, buddy till exam day */}
      <PlanCta
        analytics="buy_tillcat"
        onClick={() => tap('tillcat')}
        disabled={busy !== null}
        className="block w-full rounded-2xl bg-stone-900 px-4 py-4 text-left text-white transition-transform active:scale-[0.99] disabled:opacity-60"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">Get my IIM buddy — till CAT</span>
          <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Best value</span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-extrabold">₹2,999</span>
          <span className="text-xs text-stone-500 line-through">₹3,996</span>
          <span className="text-[11px] font-semibold text-emerald-400">save ₹997</span>
        </div>
        <p className="mt-1 text-[12px] text-stone-300">Your buddy all the way to exam day · about ₹25/day</p>
        <span className="mt-2.5 block rounded-xl bg-orange-500 py-2.5 text-center text-sm font-bold text-white">
          {busy === 'tillcat' ? 'Starting…' : 'Start now →'}
        </span>
      </PlanCta>

      {/* Low-commitment option */}
      <PlanCta
        analytics="buy_monthly"
        onClick={() => tap('monthly')}
        disabled={busy !== null}
        className="mt-2 block w-full rounded-2xl border border-stone-200 px-4 py-3 text-left transition-colors hover:border-stone-400 disabled:opacity-60"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-stone-900">Just this month</span>
          <span className="text-sm font-bold text-stone-900">{busy === 'monthly' ? 'Starting…' : '₹999'}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-stone-500">Month to month · you&apos;ll decide again in 30 days</p>
      </PlanCta>

      {/* "Verified IIM alumni" stood here until 19 Aug. It was a claim about
          VERIFICATION, and iim_verified_at is null for all eight buddies --
          the column exists because someone intended to verify and never did.
          A promise of verification, made to a student at the moment they are
          about to pay, with nothing verified behind it.
          The percentile floor below is a real stored number for every mentor
          (98 to 99.5), so this line is now true as written. When the founder
          verifies the institutes, iim-claim.ts lets the stronger claim back
          in -- per mentor, automatically, and only for the ones checked. */}
      <p className="mt-2.5 text-center text-[11px] text-stone-400">
        Every buddy cleared CAT at 98+ percentile · no auto-debit, ever · full refund in your first month if you&apos;ve logged 20+ study days
      </p>
      {message && <p className="mt-2 text-center text-xs text-stone-600">{message}</p>}
      {callMe && <CallMeModal onClose={() => setCallMe(false)} />}
    </div>
  );
}

// Legacy button → sheet flow, still used by the recommended-buddies and daily
// nudge surfaces. Opens the loud two-option sheet; taps pay through the same
// shared checkout path.
export function UnlockBuddyButton({
  children = 'Get my 1:1 mentor',
  variant = 'primary',
  size = 'md',
  className = '',
  fullName,
}: {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'accent' | 'teal' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  fullName?: string;
}) {
  const [open, setOpen] = useState(false);
  const { pay, busy, message, callMe, setCallMe } = useBuddyCheckout();
  const tap = (plan: PlanId) => pay(plan, fullName);

  function openSheet() {
    logCtaClick();
    track('buddy_unlock_open', {});
    setOpen(true);
  }

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={openSheet}>
        {children}
      </Button>

      {callMe && <CallMeModal onClose={() => { setCallMe(false); setOpen(false); }} />}

      {open && !callMe && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-[11px] font-bold uppercase tracking-widest text-orange-600">{catUrgencyLabel()}</p>
            <h2 className="mt-1.5 text-center text-xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              The hard part now isn&apos;t studying.<br />It&apos;s not knowing if you&apos;re wasting these months.
            </h2>
            <p className="mt-2 text-center text-sm text-stone-600">
              A <span className="font-semibold text-stone-800">real IIM senior</span> tells you exactly what to fix — every week, till exam day.
            </p>

            <div className="mt-5 space-y-2.5">
              {/* The ladder, founder order (20 Aug): the ₹299 session is the
                  ENTRY POINT and the primary CTA; the subscriptions stay
                  clearly available as the core upsell. The rung LINKS rather
                  than charging here: BookSessionCard fetches mentor
                  availability before rendering a button, and capacity is 21
                  sessions a week — selling inline would take money for time
                  the mentors cannot give, which that card exists to prevent. */}
              <a
                href="/student/buddy"
                onClick={() => setOpen(false)}
                className="block w-full rounded-2xl border-2 border-stone-900 bg-stone-900 px-4 py-3.5 text-left text-white transition-transform active:scale-[0.99]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">Just one session first</span>
                  <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Start here</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold">₹299</span>
                </div>
                <p className="mt-0.5 text-[11px] text-stone-300">One 1-on-1 with an IIM senior · no subscription</p>
                <span className="mt-2 inline-block text-sm font-bold text-orange-300">See if a mentor has room →</span>
              </a>

              <PlanCta
                onClick={() => tap('monthly')}
                disabled={busy !== null}
                className="block w-full rounded-2xl border border-stone-200 px-4 py-3 text-left transition-colors hover:border-stone-400 disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-900">Go deeper — monthly</span>
                  <span className="text-sm font-bold text-stone-900">{busy === 'monthly' ? 'Starting…' : '₹999'}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-stone-500">Month to month · you&apos;ll decide again in 30 days</p>
              </PlanCta>

              <PlanCta
                onClick={() => tap('tillcat')}
                disabled={busy !== null}
                className="block w-full rounded-2xl border border-stone-300 px-4 py-3 text-left transition-colors hover:border-stone-500 disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-900">Till CAT — full support</span>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">Best value</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-stone-900">₹2,999</span>
                  <span className="text-xs text-stone-400 line-through">₹3,996</span>
                  <span className="text-[11px] font-semibold text-emerald-600">save ₹997</span>
                </div>
                <p className="mt-0.5 text-[11px] text-stone-500">Your buddy all the way to exam day · about ₹25/day{busy === 'tillcat' ? ' · Starting…' : ''}</p>
              </PlanCta>
            </div>

            <p className="mt-3 text-center text-[11px] text-stone-400">
              1:1 mentor, real IIM · live weekly sessions &amp; daily guidance · no auto-debit, ever.
              Full refund in your first month if you&apos;ve logged 20+ study days.
            </p>

            {message && <p className="mt-3 text-center text-xs text-stone-600">{message}</p>}

            <button type="button" onClick={() => setOpen(false)} className="mt-2 w-full text-center text-xs text-stone-400 hover:text-stone-600">
              Not now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
