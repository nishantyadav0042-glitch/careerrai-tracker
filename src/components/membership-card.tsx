'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PLANS, type PlanId } from '@/lib/plans';
import { Sparkles, Heart } from 'lucide-react';
import { trackMeta } from '@/lib/track';
import { escapeToBrowserForPayment, paymentHandoffUrl, readPaymentSurfaceSignals } from '@/lib/store-build';
import { paymentSurface, HANDOFF_COPY } from '@/lib/payment-surface';
import { loadRazorpay, failureMessage } from '@/lib/razorpay-checkout';
import { track } from '@/lib/journey';

// Two kinds of student, and nothing else (founder, 10 Aug): PREMIUM has paid
// for the subscription and therefore has a mentor; FREE is using the app and
// has not subscribed. The other three values are transitions between them.
type SubStatus = 'free' | 'active' | 'expired' | 'paused' | 'refund_requested';

interface MembershipCardProps {
  status: SubStatus;
  plan: string | null;
  renewsAt: string | null;
  fullName: string;
  // Founder scholarship attached to this account, with per-plan adjusted prices.
  scholarship?: { label: string; pricing: Record<PlanId, string> } | null;
}

const STATUS_LABEL: Record<SubStatus, { text: string; color: 'green' | 'orange' | 'stone' | 'amber' }> = {
  free: { text: 'Free', color: 'stone' },
  active: { text: 'Active', color: 'green' },
  expired: { text: 'Paused', color: 'amber' },
  paused: { text: 'Paused', color: 'amber' },
  refund_requested: { text: 'Refund requested', color: 'stone' },
};

export function MembershipCard({ status, plan, renewsAt, fullName, scholarship }: MembershipCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [coupon, setCoupon] = useState('');

  async function upgrade(planId: PlanId) {
    // Where checkout is allowed to open is ONE decision, in lib/payment-surface,
    // measured rather than assumed. This used to read `if (isStoreBuild())` with
    // an iOS branch nested inside, and an installed iOS PWA is neither store
    // build — so it fell through to the inline modal below and could not
    // complete a payment. 7 opens, 7 dismissals, 0 payments.
    const surface = paymentSurface(readPaymentSurfaceSignals());

    if (surface === 'ios_link_handoff') {
      const url = await paymentHandoffUrl('/student/profile');
      track('pay_escape_browser', { plan: planId, surface: 'membership', mode: 'ios_link', linkReady: url != null });
      setPayUrl(url ?? 'https://careerrai.in/student/profile');
      setMessage(url ? HANDOFF_COPY.ready : HANDOFF_COPY.noLink);
      return;
    }

    if (surface === 'popup_handoff') {
      const opened = await escapeToBrowserForPayment('/student/profile');
      track('pay_escape_browser', { plan: planId, surface: 'membership', mode: 'popup', opened });
      if (!opened) {
        // A sentence telling the student to go and find the site themselves is
        // a dead end on a phone. Always leave a tappable link behind.
        setPayUrl('https://careerrai.in/student/profile');
        setMessage(HANDOFF_COPY.noLink);
      }
      return;
    }
    setBusy(planId);
    setMessage(null);
    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, coupon: coupon.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Payments kill-switch (403): degrade to the human path like the
        // unlock sheet does — never show a raw server string to a paying student.
        if (res.status === 403) { setMessage('Online payment is briefly unavailable — our team will reach out to set up your 1:1 mentor.'); return; }
        setMessage(data.error ?? "We couldn't start checkout. Please try again.");
        return;
      }

      // A scholarship/coupon brought the price to zero — already activated.
      if (data.free) {
        setMessage('You’re all set — your access is active. Refreshing…');
        // router.refresh() re-runs the server components (fresh premium state)
        // without tearing down and re-downloading the whole app.
        setTimeout(() => router.refresh(), 1500);
        return;
      }

      const ok = await loadRazorpay();
      if (!ok || !window.Razorpay) { setMessage('Could not load the payment window. Try again.'); return; }

      const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: 'CareerRai',
        description: `1:1 CAT mentorship (${PLANS[planId].label}) — live sessions with an IIM mentor`,
        // See create-order: server-resolved phone/email so Razorpay stops
        // re-asking a signed-in student for details we already verified.
        prefill: data.prefill ?? { name: fullName },
        theme: { color: '#E8652D' },
        modal: {
          ondismiss: () => {
            track('pay_dismissed', { plan: planId, orderId: data.orderId, surface: 'membership' });
            setMessage('Payment cancelled — nothing was charged. Tap again whenever you’re ready.');
          },
        },
        handler: () => {
          // Confirmation is server-side via webhook; just reassure + refresh.
          track('pay_success_callback', { plan: planId, orderId: data.orderId, surface: 'membership' });
          trackMeta('Purchase', { value: (data.amount ?? 0) / 100, currency: data.currency ?? 'INR', content_name: `1:1 CAT mentorship (${PLANS[planId].label})` }, data.orderId);
          setMessage('Payment received — setting up your 1:1 mentor…');
          setTimeout(() => router.refresh(), 4000);
        },
      });
      rzp.on('payment.failed', (payload: unknown) => {
        const err = (payload as { error?: { reason?: string; step?: string } } | null)?.error;
        track('pay_failed', { plan: planId, orderId: data.orderId, surface: 'membership', reason: err?.reason ?? null, step: err?.step ?? null });
        setMessage(failureMessage(payload));
      });
      rzp.open();
      track('pay_checkout_opened', { plan: planId, orderId: data.orderId, surface: 'membership' });
    } catch {
      setMessage('Something went wrong with the payment. Nothing was charged — please try again.');
    } finally {
      setBusy(null);
    }
  }

  const badge = STATUS_LABEL[status];
  const isPaused = status === 'paused' || status === 'expired';
  const showPlans = status === 'free' || isPaused;
  const verb = isPaused ? 'Reactivate' : 'Start';

  // Journey-length plans are the heroes; monthly is the quiet fallback.
  const journeyPlans = (Object.keys(PLANS) as PlanId[]).filter((id) => PLANS[id].journey);
  const fallbackPlans = (Object.keys(PLANS) as PlanId[]).filter((id) => !PLANS[id].journey);

  function priceFor(id: PlanId): string {
    return scholarship ? scholarship.pricing[id] : PLANS[id].display;
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Your mentorship</div>
        <Badge color={badge.color}>{badge.text}</Badge>
      </div>

      {/* This used to read "You're on the free beta — full access, no charge",
          written when the app genuinely had no paywall. Under freemium it was
          simply false: a free student does not have a mentor, which is the
          part that costs money. Telling 258 students they already had
          everything is the worst possible thing to say on the one screen where
          they decide whether to pay. */}
      {status === 'free' && (
        <p className="text-sm text-stone-600 mb-4">
          The app is free — your study plan, daily log, streak and mocks stay yours, always.
          A mentor is the paid part: one person, never more than 5 students, who knows your
          numbers and checks in on you by name.
        </p>
      )}
      {status === 'active' && (
        <p className="text-sm text-stone-600 mb-4">
          {plan && PLANS[plan as PlanId] ? `${PLANS[plan as PlanId].label} mentorship — active` : 'Mentorship active'}
          {renewsAt && <> · renews {new Date(renewsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>}
        </p>
      )}
      {isPaused && (
        <p className="text-sm text-stone-600 mb-4">
          Your 1:1 mentorship has <strong>ended</strong> — your streak, mocks, debriefs and everything else
          stay exactly as they are, free to use. Reactivate whenever you want your mentor back.
        </p>
      )}
      {status === 'refund_requested' && (
        <p className="text-sm text-stone-600 mb-4">Refund requested — our team is processing it. You&apos;ll hear from us shortly.</p>
      )}

      {showPlans && (
        <>
          {scholarship && (
            <div className="flex items-start gap-2 rounded-xl bg-orange-50 border border-orange-100 px-3 py-2.5 mb-3">
              <Heart className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
              <p className="text-xs text-stone-700">
                A <strong>founder scholarship</strong> is on your account — your prices below are already adjusted.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {journeyPlans.map((id) => (
              <button
                key={id}
                onClick={() => upgrade(id)}
                disabled={busy !== null}
                className="w-full flex items-center justify-between rounded-xl border border-stone-200 px-4 py-3 hover:border-stone-900 transition-colors disabled:opacity-50 text-left"
              >
                <span className="min-w-0">
                  <span className="text-sm font-semibold text-stone-900 flex items-center gap-1.5">
                    {PLANS[id].label}
                    {PLANS[id].recommended && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-orange-600">
                        <Sparkles className="w-3 h-3" /> Best for the journey
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-stone-500 mt-0.5">{PLANS[id].tagline}</span>
                </span>
                <span className="text-right shrink-0 pl-3">
                  <span className="block text-sm font-bold text-orange-600">
                    {busy === id ? 'Starting…' : priceFor(id)}
                  </span>
                  {scholarship && (
                    <span className="block text-[10px] text-stone-400 line-through">{PLANS[id].display}</span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {/* Monthly — the quiet fallback for those who insist on month-to-month. */}
          {fallbackPlans.map((id) => (
            <button
              key={id}
              onClick={() => upgrade(id)}
              disabled={busy !== null}
              className="w-full flex items-center justify-center gap-1.5 mt-2 text-xs text-stone-500 hover:text-stone-800 transition-colors disabled:opacity-50"
            >
              {busy === id ? 'Starting…' : `or pay month-to-month — ${priceFor(id)}/mo`}
            </button>
          ))}

          {!scholarship && (
            <div className="mt-3 pt-3 border-t border-stone-100">
              <label className="text-[11px] uppercase tracking-wide text-stone-400 font-semibold">Coupon code (optional)</label>
              <input
                value={coupon}
                onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                placeholder="e.g. WELCOME20"
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm font-mono uppercase tracking-wide focus:outline-none focus:border-stone-900"
              />
            </div>
          )}

          <p className="text-[11px] text-stone-400 mt-3">
            One commitment for your whole prep season — no auto-debit, ever. {verb} when you&apos;re ready.
          </p>
        </>
      )}

      {message && <p className="text-xs text-stone-600 mt-3">{message}</p>}
      {payUrl && (
        <a
          href={payUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-center text-sm font-semibold text-stone-900"
        >
          {payUrl.includes('/go?') ? 'Continue to secure payment →' : 'Open careerrai.in to pay →'}
        </a>
      )}
    </Card>
  );
}
