'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PLANS, type PlanId } from '@/lib/plans';
import { Sparkles, Heart } from 'lucide-react';
import { trackMeta } from '@/lib/track';

type SubStatus = 'free_beta' | 'active' | 'expired' | 'paused' | 'refund_requested';

interface MembershipCardProps {
  status: SubStatus;
  plan: string | null;
  renewsAt: string | null;
  fullName: string;
  // Founder scholarship attached to this account, with per-plan adjusted prices.
  scholarship?: { label: string; pricing: Record<PlanId, string> } | null;
}

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

const STATUS_LABEL: Record<SubStatus, { text: string; color: 'green' | 'orange' | 'stone' | 'amber' }> = {
  free_beta: { text: 'Free beta', color: 'green' },
  active: { text: 'Active', color: 'green' },
  expired: { text: 'Paused', color: 'amber' },
  paused: { text: 'Paused', color: 'amber' },
  refund_requested: { text: 'Refund requested', color: 'stone' },
};

// The installed/standalone app — the iOS WKWebView and Android TWA store
// builds. In-app card checkout is suppressed there for app-store compliance.
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}

export function MembershipCard({ status, plan, renewsAt, fullName, scholarship }: MembershipCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [coupon, setCoupon] = useState('');

  async function upgrade(planId: PlanId) {
    setBusy(planId);
    setMessage(null);
    // App-store compliance (audit, 24 Jul): never open an in-app web card
    // checkout inside the installed/standalone app — Apple 3.1.1 / Google Play
    // Billing reject it. Route to the human path, matching the buddy sheet. A
    // normal browser tab keeps the direct checkout below.
    if (isStandalone()) {
      setBusy(null);
      setMessage('To set up your 1:1 mentor, our team will reach out to you shortly.');
      return;
    }
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
        prefill: { name: fullName },
        theme: { color: '#E8652D' },
        handler: () => {
          // Confirmation is server-side via webhook; just reassure + refresh.
          trackMeta('Purchase', { value: (data.amount ?? 0) / 100, currency: data.currency ?? 'INR', content_name: `1:1 CAT mentorship (${PLANS[planId].label})` }, data.orderId);
          setMessage('Payment received — setting up your 1:1 mentor…');
          setTimeout(() => router.refresh(), 4000);
        },
      });
      rzp.open();
    } catch {
      setMessage('Something went wrong with the payment. Nothing was charged — please try again.');
    } finally {
      setBusy(null);
    }
  }

  const badge = STATUS_LABEL[status];
  const isPaused = status === 'paused' || status === 'expired';
  const showPlans = status === 'free_beta' || isPaused;
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

      {status === 'free_beta' && (
        <p className="text-sm text-stone-600 mb-4">
          You&apos;re on the free beta — full access, no charge. CAT is a season, not a subscription:
          commit to the journey when you&apos;re ready.
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
          Your streak, dream tracking, mock history, debriefs, and buddy access are <strong>paused — not gone</strong>.
          Reactivate to continue exactly where you left off.
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
    </Card>
  );
}
