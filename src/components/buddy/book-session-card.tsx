'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadRazorpay, failureMessage, redirectCheckoutOptions, checkoutCallbackUrl } from '@/lib/razorpay-checkout';
import { track } from '@/lib/journey';
import { readPaymentSurfaceSignals } from '@/lib/store-build';
import { paymentSurface, usesRedirectCheckout } from '@/lib/payment-surface';
import { ensureTransactableOrigin } from '@/lib/checkout-origin-guard';
import { IntentPicker, intentIsComplete } from '@/components/session/intent-picker';
import type { SessionIntent } from '@/lib/session-intent';
import { payFunnel } from '@/lib/payment-funnel-client';

// ── The single-session door, in the Buddy section ─────────────────────────────────────
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
  // WHY, captured before the money. The mentor opens the call already knowing
  // the problem, and the company can finally answer what students are actually
  // paying to solve.
  const [intents, setIntents] = useState<SessionIntent[]>([]);
  const [intentNote, setIntentNote] = useState('');
  const readyToPay = intentIsComplete(intents, intentNote);

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
    // Guarded here AND on the server AND by a CHECK constraint. A student must
    // never reach Razorpay for a booking the database would then refuse.
    if (!readyToPay) return;
    track('session_book_click', { finding: findingKind ?? null, intents, primary: intents[0] ?? null });

    setBusy(true); setError(null);
    try {
      // Incident #59: Razorpay refuses careerrai-daily.vercel.app outright, so
      // an order minted here can never be paid. Move to the checkout origin
      // BEFORE minting — a hand-off after the order exists would strand a live
      // order on a dead domain. A no-op on every transactable origin.
      if ((await ensureTransactableOrigin('buddy')).move) return;

      const res = await fetch('/api/sessions/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finding_kind: findingKind ?? null,
          finding_evidence: findingEvidence ?? null,
          // The student's own words. Kept SEPARATE from finding_kind, which is
          // what the product diagnosed — a student who says "QA is weak" while
          // the mocks say DILR is the most interesting row we can hold.
          // The full list, in the student's own picking order. The server
          // takes element 0 as the primary and writes it to session_intent,
          // which is the key mentor matching reads.
          session_intents: intents,
          session_intent_note: intentNote.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'Could not start checkout — try again.'); return; }

      const ok = await loadRazorpay();
      if (!ok || !window.Razorpay) { setError('Could not load the payment window. Try again.'); return; }

      // ── Installed iOS PWA: navigate, never a modal ─────────────────────
      // The modal needs popups this surface blocks, and an anchor cannot
      // escape to Safari from a standalone PWA either — that combination is
      // what produced the "tap share, choose Open in Safari" screen. Redirect
      // mode keeps the SAME order id, so the webhook path is unchanged.
      if (usesRedirectCheckout(readPaymentSurfaceSignals())) {
        // Recorded BEFORE the navigation, because after it this page is gone.
        // Without this, "checkout never rendered" and "rendered and they left"
        // are the same row — which is why three iOS fixes shipped blind.
        payFunnel('payment_checkout_opened', { plan: 'session', orderId: json.orderId, surface: 'session_redirect' });
        track('pay_redirect', { plan: 'session', primary: intents[0] ?? null });
        // Recorded BEFORE the navigation, because one line later this page is
        // gone and nothing client-side can report again. The server records
        // the matching 'returned' event, so a gap between the two is exactly
        // "left for Razorpay and never came back" — the failure that was
        // invisible while the modal era's events were the only ones we had.
        payFunnel('payment_checkout_navigating', { plan: 'session', orderId: json.orderId, surface: 'session' });
        new window.Razorpay(redirectCheckoutOptions({
          keyId: json.keyId,
          orderId: json.orderId,
          amount: json.amount,
          currency: json.currency,
          name: 'CareerRai',
          description: `${json.minutes}-min 1:1 session with an IIM Buddy`,
          prefill: json.prefill,
          callbackUrl: checkoutCallbackUrl('buddy'),
        })).open();
        return;
      }

      payFunnel('payment_checkout_opened', { plan: 'session', orderId: json.orderId, surface: 'session_inline' });

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
            {/* WHY, before the money. Asked here rather than after payment so
                the mentor is never handed a session with no stated problem,
                and so a student is never charged for a booking the database
                would then refuse. */}
            <div className="mb-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <IntentPicker
                value={intents}
                note={intentNote}
                disabled={busy}
                onChange={(v) => { setIntents(v.intents); setIntentNote(v.note); }}
              />
            </div>

            {/* ONE button on every platform. There used to be an anchor
                variant here for the iOS hand-off; that path is gone, so the
                intent gate can no longer be bypassed by a link that navigates
                whatever the handler decides. */}
            <button
              type="button" onClick={() => void book()} disabled={busy || !readyToPay}
              className="w-full rounded-xl bg-orange-500 py-3 text-[14px] font-extrabold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? 'Opening checkout…' : `Book my session — ${state.priceLabel}`}
            </button>
            {!readyToPay && (
              <p className="mt-1.5 text-center text-[11px] font-semibold text-stone-500">
                Pick what you need help with first.
              </p>
            )}
            <p className="mt-2 text-center text-[10.5px] text-stone-400">One-time. Nothing renews.</p>
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
