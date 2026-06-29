'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PLANS, type PlanId } from '@/lib/plans';
import { Sparkles } from 'lucide-react';

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
  children = 'Unlock your buddy',
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
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Shown when payments aren't enabled yet — fall back to the call flow.
  const [callMe, setCallMe] = useState(false);

  function openSheet() {
    logCtaClick();
    setOpen(true);
  }

  async function pay(planId: PlanId) {
    setBusy(planId);
    setMessage(null);
    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });

      // Payments not enabled yet (kill-switch off) → degrade to the call flow.
      if (res.status === 403) { setCallMe(true); return; }

      const data = await res.json();
      if (!res.ok) { setMessage(data.error ?? 'Checkout shuru nahi ho paaya. Dobara try karo.'); return; }

      // A scholarship/coupon already made it free → premium activated server-side.
      if (data.free) {
        setMessage('Ho gaya! Aapka buddy unlock ho raha hai — refresh kar rahe hain…');
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      const ok = await loadRazorpay();
      if (!ok || !window.Razorpay) { setMessage('Payment window load nahi hua. Dobara try karo.'); return; }

      const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: 'CareerRai',
        description: `${PLANS[planId].label} — IIM buddy`,
        prefill: fullName ? { name: fullName } : undefined,
        theme: { color: '#E8652D' },
        handler: () => {
          // Confirmation is server-side via webhook; reassure + refresh.
          setMessage('Payment ho gaya — aapka buddy confirm kar rahe hain… 🎉');
          setTimeout(() => window.location.reload(), 4000);
        },
      });
      rzp.open();
    } catch {
      setMessage('Kuch galat ho gaya. Dobara try karo.');
    } finally {
      setBusy(null);
    }
  }

  const journeyPlans = (Object.keys(PLANS) as PlanId[]).filter((id) => PLANS[id].journey);
  const fallbackPlans = (Object.keys(PLANS) as PlanId[]).filter((id) => !PLANS[id].journey);

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
                <h2 className="text-lg font-bold text-stone-900">Ho gaya! 🙌</h2>
                <p className="mt-1 text-sm text-stone-600">
                  Hamari team aapko jaldi call karke aapka IIM buddy set up karegi. Tab tak — aaj ka log
                  bhar do, taaki aapke buddy ke paas data ready ho. 💪
                </p>
                <Button variant="primary" size="md" className="mt-5 w-full" onClick={() => setOpen(false)}>
                  Theek hai
                </Button>
              </div>
            ) : (
              <>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-2xl">🔓</div>
                <h2 className="text-center text-lg font-bold text-stone-900">Apna IIM buddy unlock karo</h2>
                <p className="mt-1 text-center text-sm text-stone-600">
                  Ek <span className="font-semibold text-stone-800">real IIM senior</span> jo roz aapko track kare,
                  har mock aapke saath decode kare, aur har hafte aapse mile.
                </p>

                <ul className="mt-4 space-y-2 text-sm text-stone-700">
                  <li className="flex gap-2"><span>🎯</span> Roz aapke logs dekhke kal ka plan</li>
                  <li className="flex gap-2"><span>📊</span> Har mock aapke saath decode — har error named</li>
                  <li className="flex gap-2"><span>🎥</span> Weekly 1-on-1 video session</li>
                </ul>

                <div className="mt-5 space-y-2">
                  {journeyPlans.map((id) => (
                    <button
                      key={id}
                      onClick={() => pay(id)}
                      disabled={busy !== null}
                      className="w-full flex items-center justify-between rounded-xl border border-stone-200 px-4 py-3 text-left transition-colors hover:border-stone-900 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-900">
                          {PLANS[id].label}
                          {PLANS[id].recommended && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-orange-600">
                              <Sparkles className="w-3 h-3" /> Best
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-stone-500">{PLANS[id].tagline}</span>
                      </span>
                      <span className="shrink-0 pl-3 text-sm font-bold text-orange-600">
                        {busy === id ? 'Starting…' : PLANS[id].display}
                      </span>
                    </button>
                  ))}

                  {fallbackPlans.map((id) => (
                    <button
                      key={id}
                      onClick={() => pay(id)}
                      disabled={busy !== null}
                      className="mt-1 w-full text-center text-xs text-stone-500 transition-colors hover:text-stone-800 disabled:opacity-50"
                    >
                      {busy === id ? 'Starting…' : `ya month-to-month — ${PLANS[id].display}/mo`}
                    </button>
                  ))}
                </div>

                <p className="mt-3 text-center text-[11px] text-stone-400">
                  21-din try karo, value na mile toh full refund. No auto-debit, ever.
                </p>

                {message && <p className="mt-3 text-center text-xs text-stone-600">{message}</p>}

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-2 w-full text-center text-xs text-stone-400 hover:text-stone-600"
                >
                  Abhi nahi
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
