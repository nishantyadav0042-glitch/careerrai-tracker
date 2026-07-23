'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PLANS, type PlanId } from '@/lib/plans';
import { trackMeta } from '@/lib/track';
import { track } from '@/lib/journey';

// The "Unlock your buddy" CTA. Opening it fires the buddy_cta_click engagement
// event (→ sales-ready) AND offers in-app Razorpay checkout for the ₹999 buddy
// upgrade. On a successful payment the Razorpay webhook flips is_premium and
// queues a buddy server-side; here we just reassure and refresh. If payments are
// still flagged off (create-order returns 403), it degrades to the call flow.

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function logCtaClick() {
  fetch('/api/engagement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'buddy_cta_click' }),
  }).catch(() => {});
}

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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Shown when payments aren't enabled yet — fall back to the call flow.
  const [callMe, setCallMe] = useState(false);

  function openSheet() {
    logCtaClick();
    // Also log to student_events so the buddy funnel (open → plan tap) lives in
    // one analytics table, queryable per student.
    track('buddy_unlock_open', {});
    setOpen(true);
  }

  async function pay(planId: PlanId) {
    setBusy(planId);
    setMessage(null);
    // Record the EXACT plan tapped BEFORE calling checkout — so intent is
    // captured even when payments are off (403) or the student abandons the
    // Razorpay window. This is the "who tapped ₹999 / ₹2,499 / ₹4,499" signal.
    track('buddy_plan_click', { plan: planId, price: PLANS[planId].display, amountPaise: PLANS[planId].amountPaise });
    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });

      // Payments not enabled yet (kill-switch off) → degrade to the call flow.
      if (res.status === 403) { setCallMe(true); return; }

      const data = await res.json();
      if (!res.ok) { setMessage(data.error ?? 'Checkout could not start. Please try again.'); return; }

      // A scholarship/coupon already made it free → premium activated server-side.
      if (data.free) {
        setMessage('Done! Setting up your 1:1 mentor — refreshing…');
        // Soft refresh: re-runs server components for fresh premium state
        // without a full app reload at the highest-value moment.
        setTimeout(() => router.refresh(), 1500);
        return;
      }

      const ok = await loadRazorpay();
      if (!ok || !window.Razorpay) { setMessage('The payment window failed to load. Please try again.'); return; }

      const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: 'CareerRai',
        // Reviewer- and payer-visible: names the charge as a 1:1 live
        // mentorship service (person-to-person), the store-billing-exempt category.
        description: `1:1 CAT mentorship (${PLANS[planId].label}) — live sessions with an IIM mentor`,
        prefill: fullName ? { name: fullName } : undefined,
        theme: { color: '#E8652D' },
        handler: () => {
          // Confirmation is server-side via webhook; reassure + refresh.
          trackMeta('Purchase', { value: (data.amount ?? 0) / 100, currency: data.currency ?? 'INR', content_name: `1:1 CAT mentorship (${PLANS[planId].label})` }, data.orderId);
          setMessage('Payment received — confirming your buddy… 🎉');
          setTimeout(() => router.refresh(), 4000);
        },
      });
      rzp.open();
    } catch {
      setMessage('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={openSheet}>
        {children}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {callMe ? (
              <div className="py-4 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl">✅</div>
                <h2 className="text-lg font-bold text-stone-900">All set! 🙌</h2>
                <p className="mt-1 text-sm text-stone-600">
                  Our team will call you shortly to set up your IIM buddy. In the meantime, log
                  today&apos;s session so your buddy has your data ready. 💪
                </p>
                <Button variant="primary" size="md" className="mt-5 w-full" onClick={() => setOpen(false)}>
                  Got it
                </Button>
              </div>
            ) : (
              <>
                <p className="text-center text-[11px] font-bold uppercase tracking-widest text-orange-600">Only 4 months to CAT</p>
                <h2 className="mt-1.5 text-center text-xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
                  The hard part now isn&apos;t studying.<br />It&apos;s not knowing if you&apos;re wasting these months.
                </h2>
                <p className="mt-2 text-center text-sm text-stone-600">
                  A <span className="font-semibold text-stone-800">real IIM senior</span> tells you exactly what to fix — every week, till exam day.
                </p>

                {/* The choice: one payment till CAT (hero) vs month-to-month */}
                <div className="mt-5 space-y-2.5">
                  <button
                    onClick={() => pay('tillcat')}
                    disabled={busy !== null}
                    className="w-full rounded-2xl border-2 border-stone-900 bg-stone-900 px-4 py-3.5 text-left text-white transition-transform active:scale-[0.99] disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold">Till CAT</span>
                      <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Best value</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-extrabold">₹2,999</span>
                      <span className="text-xs text-stone-500 line-through">₹3,996</span>
                      <span className="text-[11px] font-semibold text-emerald-400">save ₹997</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-stone-300">Your buddy all the way to exam day · about ₹25/day</p>
                    <span className="mt-2 inline-block text-sm font-bold text-orange-300">
                      {busy === 'tillcat' ? 'Starting…' : 'Get my buddy till CAT →'}
                    </span>
                  </button>

                  <button
                    onClick={() => pay('monthly')}
                    disabled={busy !== null}
                    className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-left transition-colors hover:border-stone-400 disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-stone-900">Just this month</span>
                      <span className="text-sm font-bold text-stone-900">{busy === 'monthly' ? 'Starting…' : '₹999'}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-stone-500">Month to month · you&apos;ll decide again in 30 days</p>
                  </button>
                </div>

                <p className="mt-3 text-center text-[11px] text-stone-400">
                  1:1 mentor, real IIM · live weekly sessions &amp; daily guidance · no auto-debit, ever.
                </p>

                {message && <p className="mt-3 text-center text-xs text-stone-600">{message}</p>}

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-2 w-full text-center text-xs text-stone-400 hover:text-stone-600"
                >
                  Not now
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
