'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ── AFTER THE MONEY, NEVER BEFORE IT ────────────────────────────────────────
//
// Founder rule, 27 Aug, non-negotiable: Google must never touch the payment
// funnel. This card is the whole of the student-side Google offer, and it is
// deliberately built so it CANNOT appear early:
//
//   · it renders only on ?pay=paid, which the Razorpay callback appends AFTER
//     the payment is verified and the credit exists
//   · it is a separate component from anything in the checkout path — nothing
//     in create-order, the Razorpay handler or the webhook imports it
//   · declining is a real, equal choice that costs the student nothing
//
// So the sequence can only ever be: pay → success → credit → offer. There is
// no ordering in which this can run first, which is stronger than a rule
// saying it should not.
//
// WHY OFFER IT AT ALL. A connected calendar is what turns "your session is
// booked" into an event on their phone with a reminder attached. That is worth
// asking for — once, at the moment the session becomes real, and never as a
// toll gate.
export function PostPaymentGoogle({ connected }: { connected: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const [going, setGoing] = useState(false);

  // Already connected, or they said later. Nothing to ask.
  if (connected || dismissed) return null;

  async function connect() {
    setGoing(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      // The purchase is already complete and unaffected. Failing quietly and
      // getting out of the way is the correct outcome here — this is a
      // convenience, and it must never look like the session is at risk.
      console.error('[post-payment-google]', error.message);
      setDismissed(true);
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600">
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </span>
        <p className="text-[15px] font-extrabold text-emerald-900">Your session is ready</p>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-emerald-900/80">
        Connect Google to make scheduling and calendar reminders easier.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={connect}
          disabled={going}
          className="flex-1 rounded-xl bg-stone-900 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
        >
          {going ? 'Opening Google…' : 'Connect Google'}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-emerald-900"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
