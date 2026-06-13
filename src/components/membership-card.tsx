'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PLANS, type PlanId } from '@/lib/plans';
import { Sparkles } from 'lucide-react';

type SubStatus = 'free_beta' | 'active' | 'expired' | 'refund_requested';

interface MembershipCardProps {
  status: SubStatus;
  plan: string | null;
  renewsAt: string | null;
  fullName: string;
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
  expired: { text: 'Expired', color: 'amber' },
  refund_requested: { text: 'Refund requested', color: 'stone' },
};

export function MembershipCard({ status, plan, renewsAt, fullName }: MembershipCardProps) {
  const [busy, setBusy] = useState<PlanId | 'refund' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function upgrade(planId: PlanId) {
    setBusy(planId);
    setMessage(null);
    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error ?? "Couldn't start checkout."); return; }

      const ok = await loadRazorpay();
      if (!ok || !window.Razorpay) { setMessage('Could not load the payment window. Try again.'); return; }

      const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: 'CareerRai',
        description: `${PLANS[planId].label} membership`,
        prefill: { name: fullName },
        theme: { color: '#E8652D' },
        handler: () => {
          // Confirmation is server-side via webhook; just reassure + refresh.
          setMessage('Payment received — confirming your membership…');
          setTimeout(() => window.location.reload(), 4000);
        },
      });
      rzp.open();
    } catch {
      setMessage('Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function requestRefund() {
    if (!confirm('Request a no-questions refund? Your founder will process it manually.')) return;
    setBusy('refund');
    setMessage(null);
    try {
      const res = await fetch('/api/payments/request-refund', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error ?? 'Could not submit request.'); return; }
      setMessage('Refund requested. Your founder will be in touch.');
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setMessage('Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const badge = STATUS_LABEL[status];
  const showPlans = status === 'free_beta' || status === 'expired';

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Membership</div>
        <Badge color={badge.color}>{badge.text}</Badge>
      </div>

      {status === 'free_beta' && (
        <p className="text-sm text-stone-600 mb-4">
          You&apos;re on the free beta — full access, no charge. Upgrade anytime to lock in your spot.
        </p>
      )}
      {status === 'active' && (
        <p className="text-sm text-stone-600 mb-4">
          {plan && PLANS[plan as PlanId] ? `${PLANS[plan as PlanId].label} plan` : 'Active plan'}
          {renewsAt && <> · renews {new Date(renewsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>}
        </p>
      )}
      {status === 'refund_requested' && (
        <p className="text-sm text-stone-600 mb-4">Refund requested — your founder is processing it manually.</p>
      )}

      {showPlans && (
        <div className="space-y-2">
          {(Object.keys(PLANS) as PlanId[]).map((id) => (
            <button
              key={id}
              onClick={() => upgrade(id)}
              disabled={busy !== null}
              className="w-full flex items-center justify-between rounded-xl border border-stone-200 px-4 py-3 hover:border-stone-900 transition-colors disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-stone-900 flex items-center gap-1.5">
                {id === 'quarterly' && <Sparkles className="w-3.5 h-3.5 text-orange-500" />}
                {PLANS[id].label}
              </span>
              <span className="text-sm font-bold text-orange-600">
                {busy === id ? 'Starting…' : PLANS[id].display}
              </span>
            </button>
          ))}
        </div>
      )}

      {status === 'active' && (
        <button
          onClick={requestRefund}
          disabled={busy !== null}
          className="text-xs text-stone-500 hover:text-stone-700 underline underline-offset-2 disabled:opacity-50"
        >
          {busy === 'refund' ? 'Submitting…' : 'Request refund'}
        </button>
      )}

      {message && <p className="text-xs text-stone-600 mt-3">{message}</p>}
    </Card>
  );
}
