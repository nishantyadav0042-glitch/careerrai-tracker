'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  isLoading: boolean;
  // Everything collected across the funnel — sent in one shot the moment
  // the account is created.
  onboarding: Record<string, unknown>;
}

type Step = 'phone' | 'otp';

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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (name.trim().length < 2) { setError('Enter your name.'); return; }
    if (phone.length !== 10 || !/^[6-9]/.test(phone)) { setError('Enter a valid 10-digit mobile number.'); return; }
    setBusy(true);
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
      if (json.ok && json.dest) {
        setProgress(100);
        setCheckedCount(CHECKLIST.length);
        setDone(true);
        // Account created — the pre-auth draft is now stale. Clear it so this
        // device never resumes a finished journey on a later visit.
        try {
          window.localStorage.removeItem('cr_preauth_draft_v1');
          window.localStorage.removeItem('cr_onboarding_topic_coverage_draft');
        } catch { /* best-effort */ }
        setTimeout(() => { window.location.href = json.dest; }, 900);
      } else {
        setBuilding(false);
        setError(json.error ?? 'That code is incorrect or expired.');
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
          <button
            type="submit"
            disabled={busy || isLoading || phone.length < 10 || name.trim().length < 2}
            className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send code →'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyAndBuild} className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-stone-900">Enter the code</p>
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
          <button
            type="submit"
            disabled={busy || isLoading || otp.length < 6}
            className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? 'Verifying…' : 'Verify & build my plan →'}
          </button>
          <button type="button" onClick={() => { setStep('phone'); setOtp(''); setError(null); }} className="w-full text-center text-xs font-medium text-stone-500 hover:text-stone-700">
            ← Change number
          </button>
        </form>
      )}
    </div>
  );
}
