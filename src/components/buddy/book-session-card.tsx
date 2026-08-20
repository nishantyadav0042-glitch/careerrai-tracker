'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadRazorpay, failureMessage } from '@/lib/razorpay-checkout';
import { track } from '@/lib/journey';
import { escapeToBrowserForPayment, readPaymentSurfaceSignals } from '@/lib/store-build';
import { paymentSurface, HANDOFF_COPY } from '@/lib/payment-surface';
import { useIosPayUrl } from '@/hooks/use-ios-pay-url';

// ── The ₹299 door, in the Buddy section ─────────────────────────────────────
//
// One session, bought by a free student. The card only ever renders three
// honest states, and two of them refuse to take money:
//
//   available     — a Buddy genuinely has room this week
//   sold out      — nobody does, and we say so plainly rather than taking the
//                   payment and hoping. Four mentors have delivered thirteen
//                   sessions in three weeks; overselling is a live risk, not a
//                   hypothetical, and the students most willing to pay us are
//                   exactly the ones a broken promise would burn.
//   already booked— they have one in flight; selling a second helps nobody
//
// Availability is fetched before the button renders, so a student never taps
// something that is going to turn them down.

interface Availability {
  available: boolean;
  alreadyBooked: boolean;
  priceLabel: string;
  minutes: number;
}

export function BookSessionCard({ findingKind, findingEvidence, mentorFirst, hasGaps }: {
  /** The diagnosis that motivated this, carried to the mentor. */
  findingKind?: string | null;
  findingEvidence?: string | null;
  /** The matched mentor's first name — "Rudra will look at", not "they". */
  mentorFirst?: string | null;
  /** Whether the diagnosis above found real gaps — picks the headline. */
  hasGaps?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<Availability | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the store-build escape couldn't open a tab. A plain "go to
  // careerrai.in yourself" sentence is a dead end on a phone — always leave a
  // tappable link behind.
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const iosUrl = useIosPayUrl('/student/buddy');

  useEffect(() => {
    let alive = true;
    fetch('/api/sessions/book')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setState(j as Availability); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!state) return null;

  async function book() {
    if (busy) return;
    track('session_book_click', { finding: findingKind ?? null });

    // Where checkout is allowed to open — see lib/payment-surface. iOS (store
    // wrapper or installed PWA) cannot complete a payment inline; it must
    // finish in the real browser. This used to skip that check entirely and
    // always open Razorpay in-page, which is why this surface has 0
    // successful payments in its history regardless of platform.
    const surface = paymentSurface(readPaymentSurfaceSignals());
    if (surface !== 'inline') {
      setBusy(true); setError(null);
      try {
        if (surface === 'ios_link_handoff') {
          // The anchor itself is the navigation (see render below); this only
          // records the tap so the funnel shows intent even though iosUrl was
          // already minted on mount.
          track('pay_escape_browser', { plan: 'session', opened: true, ios: true, mode: 'ios_link', linkReady: iosUrl != null });
          return;
        }
        const opened = await escapeToBrowserForPayment('/student/buddy');
        track('pay_escape_browser', { plan: 'session', opened, mode: 'popup' });
        if (!opened) {
          setError(HANDOFF_COPY.noLink);
          setManualUrl('https://careerrai.in/student/buddy');
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/sessions/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finding_kind: findingKind ?? null, finding_evidence: findingEvidence ?? null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'Could not start checkout — try again.'); return; }

      const ok = await loadRazorpay();
      if (!ok || !window.Razorpay) { setError('Could not load the payment window. Try again.'); return; }

      const rzp = new window.Razorpay({
        key: json.keyId,
        order_id: json.orderId,
        amount: json.amount,
        currency: json.currency,
        name: 'CareerRai',
        description: `${json.minutes}-min 1:1 session with an IIM Buddy`,
        prefill: json.prefill,
        theme: { color: '#E8652D' },
        modal: {
          ondismiss: () => {
            track('session_pay_dismissed', { orderId: json.orderId });
            setError('Payment cancelled — nothing was charged.');
          },
        },
        handler: () => {
          // The credit is minted server-side by the verified webhook; this
          // only reassures and refreshes.
          track('session_pay_success', { orderId: json.orderId });
          setError(null);
          setState((s) => (s ? { ...s, alreadyBooked: true } : s));
          setTimeout(() => router.refresh(), 3000);
        },
      });
      rzp.on('payment.failed', (payload: unknown) => setError(failureMessage(payload)));
      rzp.open();
    } catch {
      setError('Could not start checkout — check your connection.');
    } finally {
      setBusy(false);
    }
  }

  if (state.alreadyBooked) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-[13.5px] font-extrabold text-emerald-900">Your session is booked ✓</p>
        <p className="mt-1 text-[12.5px] text-emerald-800">Meeting link coming here and on WhatsApp.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-4 py-3">
        <p className="text-[15px] font-extrabold leading-tight text-stone-900">
          Get an audit of your prep at just {state.priceLabel}
        </p>
        <ul className="mt-1.5 space-y-0.5 text-[12.5px] font-medium text-stone-700">
          <li>• {state.minutes} min, 1:1 with {mentorFirst ?? 'your Buddy'}</li>
          <li>• Your gaps, ranked by marks</li>
          <li>• A written next step</li>
        </ul>
      </div>

      <div className="p-4">
        {state.available ? (
          <>
            {iosUrl ? (
              <a
                href={iosUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void book()}
                className="block w-full rounded-xl bg-orange-500 py-3 text-center text-[14px] font-extrabold text-white transition-transform active:scale-[0.99]"
              >
                {`Book my session — ${state.priceLabel}`}
              </a>
            ) : (
              <button
                type="button" onClick={() => void book()} disabled={busy}
                className="w-full rounded-xl bg-orange-500 py-3 text-[14px] font-extrabold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
              >
                {busy ? 'Opening checkout…' : `Book my session — ${state.priceLabel}`}
              </button>
            )}
            <p className="mt-2 text-center text-[10.5px] text-stone-400">One-time. Nothing renews.</p>
            {manualUrl && (
              <a href={manualUrl} className="mt-2 block text-center text-[12px] font-semibold text-orange-600 underline">
                Continue to secure payment →
              </a>
            )}
          </>
        ) : (
          // Sold out is an honest, GOOD answer: it says we protect the sessions
          // already sold. A silently oversold week does not.
          <div className="rounded-xl bg-stone-50 p-3 text-center">
            <p className="text-[13px] font-bold text-stone-800">Fully booked this week</p>
            <p className="mt-1 text-[12px] text-stone-600">Check back in a day or two.</p>
          </div>
        )}
        {error && <p className="mt-2 text-center text-[12px] font-semibold text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
