'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { track } from '@/lib/journey';

// ── THE ANCHOR GATE (Incident #62) ──────────────────────────────────────────
//
// Reached by an account that authenticated successfully but has no verified
// phone — in practice, a Google sign-in. It is not a signup screen and not a
// second login: the session already exists, and this attaches a number to it.
//
// The framing matters. A student who has just signed in and is met with
// "Connect your phone to continue" reads it as bureaucracy. What is actually
// true is that the phone is how their account survives — how a counsellor
// reaches them, how a reminder arrives, how they get back in on a new device.
// So the screen says that, in the second person, and asks once.
//
// There is no skip. Every other ask in this product is skippable on purpose;
// this one cannot be, because an account with no anchor is an account we will
// lose and cannot contact to tell.

export function LinkPhoneForm() {
  const params = useSearchParams();
  const dest = (() => {
    // Same-origin paths only — this value arrives on the URL and is handed to
    // location.assign. The check /auth/callback applies to its own `next`.
    const raw = params.get('dest');
    return raw && raw.startsWith('/') && !raw.startsWith('//') && !/[\r\n]/.test(raw)
      ? raw
      : '/student/tracker';
  })();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    track('auth_phone_step_shown', { reason: 'anchor_gate' });
    // The founder's open question — how many arrive here and never finish —
    // is only answerable if leaving is recorded as loudly as finishing.
    const onLeave = () => { if (!done) track('auth_phone_step_abandoned', { step }); };
    window.addEventListener('pagehide', onLeave);
    return () => window.removeEventListener('pagehide', onLeave);
  }, [step, done]);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setConflict(false);
    try {
      track('auth_otp_requested', { surface: 'anchor_gate' });
      const res = await fetch('/api/auth/link-phone/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const body = await res.json();
      if (body.alreadyLinked) { setDone(true); window.location.assign(dest); return; }
      if (!res.ok || !body.sent) {
        if (body.conflict) {
          setConflict(true);
          track('auth_link_refused', { reason: 'phone_belongs_to_another_account' });
        }
        setError(body.message ?? "Couldn't send the code. Try again.");
        return;
      }
      setStep('otp');
    } catch {
      setError('Network problem. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/auth/link-phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, token: otp }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        track('auth_otp_failed', { surface: 'anchor_gate' });
        setError(body.error ?? 'That code did not work.');
        return;
      }
      track('auth_otp_verified', { surface: 'anchor_gate' });
      track('auth_account_linked', { identity: 'phone', reason: 'anchor_gate' });
      track('auth_phone_step_completed', {});
      setDone(true);
      // Full navigation, not router.push: the gate lives in a server layout and
      // must re-read the freshly written anchor rather than reuse a cached RSC
      // payload from before it existed.
      window.location.assign(dest);
    } catch {
      setError('Network problem. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const input =
    'w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10';

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            {step === 'phone' ? 'One last thing — your mobile number' : 'Enter the code we sent'}
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {step === 'phone'
              ? 'This is how your buddy reaches you, how reminders arrive, and how you get back into your account on a new phone.'
              : `Sent to +91 ${phone}.`}
          </p>
        </div>

        {conflict ? (
          <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">
              This number already has a CareerRai account.
            </p>
            <p className="text-xs leading-relaxed text-amber-800">
              Your streak, plan and buddy are on that account. Sign in to it with an OTP and
              nothing is lost — we will never move your history onto a second account.
            </p>
            <a
              href="/login"
              className="block w-full rounded-2xl bg-stone-900 py-3.5 text-center text-sm font-semibold text-white active:scale-[0.98]"
            >
              Sign in with OTP →
            </a>
          </div>
        ) : step === 'phone' ? (
          <form onSubmit={requestOtp} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-800">Mobile number</label>
              <div className="relative flex items-center">
                <span className="absolute left-3 select-none text-sm font-medium text-stone-500">+91</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  required
                  maxLength={10}
                  className={`${input} pl-12`}
                />
              </div>
            </div>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={busy || phone.length < 10}
              className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send OTP →'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              required
              maxLength={6}
              className={`${input} text-center text-lg tracking-[0.4em]`}
            />
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={busy || otp.length < 6}
              className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Verifying…' : 'Verify and continue →'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('phone'); setOtp(''); setError(null); }}
              className="w-full py-2 text-xs font-medium text-stone-500"
            >
              Change number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
