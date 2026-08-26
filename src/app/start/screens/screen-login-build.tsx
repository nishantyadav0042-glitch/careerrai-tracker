'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { track } from '@/lib/journey';

interface Props {
  isLoading: boolean;
  // Everything collected across the funnel — sent in one shot the moment
  // the account is created.
  onboarding: Record<string, unknown>;
}

type Step = 'phone' | 'otp' | 'password';

const CHECKLIST = [
  'Locking your target date',
  'Mapping your syllabus coverage',
  'Building your daily routine',
  'Setting up your reminders',
];

// The account-creation step, framed as "log in while we build" — and the
// build itself stays on screen and visibly ticking instead of a blank
// loading spinner, so the student stays engaged through the one moment
// they're waiting on us. The percentage only reaches 100 once the real
// server response confirms the plan is actually saved — never before.
export default function ScreenLoginBuild({ isLoading, onboarding }: Props) {
  const [step, setStep] = useState<Step>('phone');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [checkedCount, setCheckedCount] = useState(0);
  const [done, setDone] = useState(false);
  const otpAsks = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (name.trim().length < 2) { setError('Enter your name.'); return; }
    if (phone.length !== 10 || !/^[6-9]/.test(phone)) { setError('Enter a valid 10-digit mobile number.'); return; }
    setBusy(true);
    // First ask vs resend, told apart. The signup funnel measured every step
    // EXCEPT the three that create the account; this is the first of them.
    otpAsks.current += 1;
    track(otpAsks.current === 1 ? 'auth_otp_requested' : 'auth_otp_resent',
      { surface: 'start', attempt: otpAsks.current });
    try {
      const res = await fetch('/api/auth/request-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json();
      if (json.sent) setStep('otp');
      else setError(json.message ?? "Couldn't send the code. Try again.");
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndBuild(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(otp)) { setError('Enter the 6-digit code.'); return; }
    setBusy(true);
    setBuilding(true);

    // Paced, honest progress — advances toward 92% while the real request
    // is in flight, ticking one checklist item at a time. It never reaches
    // 100 on its own; only the server response does that.
    let pct = 0;
    const tick = () => {
      pct = Math.min(92, pct + (8 + Math.random() * 6));
      setProgress(Math.round(pct));
      setCheckedCount(Math.min(CHECKLIST.length, Math.floor((pct / 92) * CHECKLIST.length)));
      if (pct < 92) timers.current.push(setTimeout(tick, 550));
    };
    tick();

    try {
      const res = await fetch('/api/auth/verify-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, token: otp, name: name.trim(), userType: 'student', onboarding }),
      });
      const json = await res.json();
      if (!json.ok) track('auth_otp_failed', { surface: 'start', status: res.status });
      if (json.ok && json.dest) {
        track('auth_otp_verified', { surface: 'start', asks: otpAsks.current });
        track('auth_identity_completed', { surface: 'start', method: 'phone_otp' });
        setProgress(100);
        setCheckedCount(CHECKLIST.length);
        setDone(true);
        // Account created — the pre-auth draft is now stale. Clear it so this
        // device never resumes a finished journey on a later visit.
        try {
          window.localStorage.removeItem('cr_preauth_draft_v1');
          window.localStorage.removeItem('cr_preauth_draft_v2');
          window.localStorage.removeItem('cr_onboarding_topic_coverage_draft');
        } catch { /* best-effort */ }
        setTimeout(() => { window.location.href = json.dest; }, 900);
      } else {
        setBuilding(false);
        setError(json.error ?? 'That OTP is incorrect or expired.');
      }
    } catch {
      setBuilding(false);
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (building) {
    return (
      <div className="space-y-6 pt-6 text-center">
        <p className="text-5xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>{progress}%</p>
        <div>
          <h1 className="text-xl font-bold text-stone-900">
            {done ? 'Your plan is ready.' : "We're building your plan"}
          </h1>
          <p className="mt-1 text-sm text-stone-500">{done ? 'Taking you in…' : 'Stay on this screen a moment.'}</p>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-stone-900 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="space-y-2 text-left">
          {CHECKLIST.map((label, i) => (
            <div key={label} className="flex items-center gap-2.5 rounded-xl border border-stone-100 px-3 py-2">
              <div className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', i < checkedCount ? 'border-stone-900 bg-stone-900' : 'border-stone-300')}>
                {i < checkedCount && <span className="text-[10px] leading-none text-white">✓</span>}
              </div>
              <p className={cn('text-sm', i < checkedCount ? 'text-stone-800 font-medium' : 'text-stone-400')}>{label}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h1 className="text-xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          We&apos;ve got everything. Log in while we build.
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">Your plan gets built the moment your number is verified.</p>
      </div>

      {step === 'phone' ? (
        <form onSubmit={requestOtp} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-800">Your name</label>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              autoFocus
              className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
            />
          </div>
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
                className="w-full rounded-xl border border-stone-300 py-2.5 pl-12 pr-3 text-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
              />
            </div>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="sticky bottom-0 z-20 bg-white/95 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
            <button
              type="submit"
              disabled={busy || isLoading || phone.length < 10 || name.trim().length < 2}
              className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send OTP →'}
            </button>
          </div>

          {/* THE ESCAPE FROM AN SMS-ONLY DEAD END.
              Everything above this line requires a 10-digit INDIAN mobile and
              an SMS that only that number can receive. Anyone who cannot —
              a store reviewer with demo credentials, a student on a new phone,
              anyone abroad — had no way past this screen at all. That is the
              Guideline 2.1 rejection we already took once (Incident #10):
              "our login sends an SMS OTP to an Indian number a reviewer cannot
              receive. They had no way in."
              Deliberately a plain, readable control rather than fine print. */}
          <div className="pt-1">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-stone-200" />
              <span className="text-[11px] font-medium text-stone-400">or</span>
              <div className="h-px flex-1 bg-stone-200" />
            </div>
            <button
              type="button"
              onClick={() => { setStep('password'); setError(null); }}
              className="w-full rounded-xl border border-stone-300 bg-white py-3 text-[13px] font-semibold text-stone-700 transition-colors hover:border-stone-900 hover:text-stone-900"
            >
              Already have an account? Log in with password
            </button>
          </div>
        </form>
      ) : step === 'password' ? (
        // Native form POST to the SAME endpoint /login uses. Not a fetch: the
        // route answers with a 302 and sets the session cookies on it, so the
        // browser must follow it. Reusing the endpoint also means this path
        // inherits its brute-force throttling (5/credential, 30/IP) instead of
        // opening a second, weaker door to the same passwords.
        <form action="/api/auth/login" method="POST" className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-800">Email or mobile number</label>
            <input
              type="text"
              name="credential"
              autoComplete="username"
              placeholder="you@example.com or 9876543210"
              required
              autoFocus
              className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-800">Password</label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Your password"
              required
              className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
            />
          </div>
          <p className="text-[11px] text-stone-400">
            Logging in takes you to your existing plan — the answers you just gave aren&apos;t applied to it.
          </p>
          <div className="sticky bottom-0 z-20 bg-white/95 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
            <button
              type="submit"
              className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
            >
              Log in →
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setStep('phone'); setError(null); }}
            className="w-full text-center text-xs font-medium text-stone-500 hover:text-stone-700"
          >
            ← Back to creating a new account
          </button>
        </form>
      ) : (
        <form onSubmit={verifyAndBuild} className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-stone-900">Enter the OTP</p>
            <p className="mb-3 text-xs text-stone-500">Sent to +91 {phone}</p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              required
              maxLength={6}
              autoFocus
              className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-center font-mono text-sm tracking-[0.3em] focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
            />
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="sticky bottom-0 z-20 bg-white/95 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
            <button
              type="submit"
              disabled={busy || isLoading || otp.length < 6}
              className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Verifying…' : 'Verify & build my plan →'}
            </button>
          </div>
          <button type="button" onClick={() => { setStep('phone'); setOtp(''); setError(null); }} className="w-full text-center text-xs font-medium text-stone-500 hover:text-stone-700">
            ← Change number
          </button>
        </form>
      )}
    </div>
  );
}
