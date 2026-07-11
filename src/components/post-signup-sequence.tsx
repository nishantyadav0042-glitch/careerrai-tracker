'use client';

import { useState, useRef, useEffect } from 'react';
import { InstallAppButton } from '@/components/install-app-button';
import { cn } from '@/lib/utils';

// Press-and-hold-to-commit (Cal-AI style): the ring fills over ~2.5s while
// held; release early and it resets with a nudge to hold again; complete it
// and the commitment "lands" with a haptic tick. Deliberate friction — the
// student earns the moment instead of tapping past it.
function HoldToCommit({ onComplete }: { onComplete: () => void }) {
  const HOLD_MS = 2500;
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'holding' | 'early' | 'done'>('idle');
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const doneRef = useRef(false);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const tick = () => {
    // eslint-disable-next-line react-hooks/purity -- rAF callback; real elapsed wall-clock time is the whole point of a hold gesture
    const p = Math.min(100, ((performance.now() - startRef.current) / HOLD_MS) * 100);
    setProgress(p);
    if (p >= 100) {
      doneRef.current = true;
      setStatus('done');
      try { navigator.vibrate?.(40); } catch { /* not supported — fine */ }
      setTimeout(onComplete, 650);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };
  const start = () => {
    if (doneRef.current) return;
    setStatus('holding');
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (doneRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setStatus((prev) => (progress > 4 && prev === 'holding' ? 'early' : 'idle'));
    setProgress(0);
  };

  const R = 66;
  const C = 2 * Math.PI * R;
  const holding = status === 'holding';
  const done = status === 'done';

  return (
    <div className="flex select-none flex-col items-center gap-3">
      <button
        type="button"
        aria-label="Press and hold to make your commitment"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        className="relative touch-none active:outline-none"
      >
        <svg width="168" height="168" viewBox="0 0 168 168" className={cn('transition-transform duration-200', holding && 'scale-105')}>
          <defs>
            <linearGradient id="commitgrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
          </defs>
          <circle cx="84" cy="84" r={R} fill="none" stroke="#e7e5e4" strokeWidth="6" />
          <circle
            cx="84" cy="84" r={R} fill="none" stroke="url(#commitgrad)" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - progress / 100)}
            transform="rotate(-90 84 84)"
            style={{ transition: holding ? 'none' : 'stroke-dashoffset 0.3s ease' }}
          />
          <circle cx="84" cy="84" r="52" fill="url(#commitgrad)" opacity={done ? 1 : 0.12} style={{ transition: 'opacity 0.3s ease' }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-4xl">
          {done ? <span className="text-white">✓</span> : '🎯'}
        </span>
      </button>
      <p className={cn('text-sm font-semibold', done ? 'text-indigo-600' : status === 'early' ? 'text-rose-500' : 'text-stone-500')}>
        {done ? 'Committed 💪' : holding ? 'Keep holding…' : status === 'early' ? 'Hold a little longer — try again' : 'Press & hold to commit'}
      </p>
    </div>
  );
}

interface Props {
  // The date the student picked in the pre-auth funnel, and the hours of prep
  // still remaining from their declared coverage — both computed server-side so
  // the reconciliation math matches the finish-date chooser exactly.
  targetIso: string | null;
  hoursLeft: number;
}

type Step = 'install' | 'date' | 'commit' | 'thanks' | 'responsibilities';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}

function fmt(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}
function toIso(d: Date): string {
  return d.toISOString().split('T')[0];
}
function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

interface DateOption { hours: number; date: Date; label: string; note: string }

// The whole post-login ceremony, once per student: reconcile the date against
// the real per-day cost → hold-to-commit → thank you → the two-way deal →
// and ONLY THEN the install ask, as the finale (founder: install comes after
// the plan is complete — an install detour mid-ceremony reads as a random
// third screen and breaks the flow, especially on iPhone where it navigates
// to the /app guide). done is persisted BEFORE the install step so the iOS
// navigation away can never re-trigger the ceremony. Gentle violet accents;
// every number is deterministic — the same remainingPrepHours model as the
// Builder, never invented.
export default function PostSignupSequence({ targetIso, hoursLeft }: Props) {
  const [today] = useState(() => new Date());
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);

  const hasDateStep = !!targetIso && hoursLeft > 0;

  // The ceremony opens with the PLAN (date → commit → thanks → deal); the
  // install ask is the finale, never the opener.
  const [step, setStep] = useState<Step>(() => (hasDateStep ? 'date' : 'commit'));

  // Chosen finish date carried into the commitment copy.
  const [chosenLabel, setChosenLabel] = useState<string>(() =>
    targetIso ? fmt(new Date(targetIso + 'T00:00:00')) : ''
  );

  // ── Date reconciliation options ──────────────────────────────────────────
  // Option 1 = keep your date (whatever daily hours that demands); the two
  // alternates are calmer paces that push the date out. All from the same
  // hoursLeft, so they can't contradict the plan.
  const target = targetIso ? new Date(targetIso + 'T00:00:00') : null;
  const daysToTarget = target ? Math.max(1, Math.round((target.getTime() - today.getTime()) / 86_400_000)) : null;
  const reqHours = daysToTarget ? Math.ceil((hoursLeft / daysToTarget) * 2) / 2 : null;

  const dateForHours = (h: number): Date => addDays(today, Math.max(7, Math.ceil(hoursLeft / h)));
  const roundHalf = (h: number) => Math.max(1.5, Math.round(h * 2) / 2);

  const options: DateOption[] = [];
  if (target && reqHours != null) {
    options.push({ hours: reqHours, date: target, label: `Keep ${fmt(target)}`, note: reqHours > 10 ? `Needs ≈ ${reqHours}h/day — intense` : `Needs ≈ ${reqHours}h a day` });
    const calmer = [roundHalf(reqHours * 0.7), roundHalf(reqHours * 0.5)];
    for (const h of calmer) {
      if (h >= reqHours) continue; // never offer a "calmer" option that isn't
      const d = dateForHours(h);
      if (options.some((o) => Math.abs(o.date.getTime() - d.getTime()) < 86_400_000)) continue;
      options.push({ hours: h, date: d, label: fmt(d), note: `A calmer ≈ ${h}h a day` });
    }
  }

  async function persist(body: Record<string, unknown>) {
    try {
      await fetch('/api/student/post-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch { /* best-effort — the flag/date write is not worth blocking the UI on */ }
  }

  const chooseDate = async (opt: DateOption) => {
    setBusy(true);
    setChosenLabel(fmt(opt.date));
    await persist({ syllabus_target_date: toIso(opt.date), study_target_hours: opt.hours });
    setBusy(false);
    setStep('commit');
  };

  // "Let's start" on the deal screen. The ceremony is complete — mark it done
  // FIRST (so the iOS install navigation to /app can never re-trigger it),
  // then show the install finale unless they're already running the app.
  const finish = async () => {
    setBusy(true);
    await persist({ done: true });
    setBusy(false);
    if (isStandalone()) { setVisible(false); return; }
    setStep('install');
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-6 py-10">

        {step === 'install' && (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-900 text-3xl">📲</div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Your plan is set. Get the app.</h1>
              <p className="mt-2 text-sm text-stone-500">Just ~3 MB · one tap to your plan every day · it&apos;s how your reminders reach you.</p>
            </div>
            <div className="space-y-2 pt-2">
              <InstallAppButton variant="banner" />
              <button type="button" onClick={() => setVisible(false)} className="w-full py-2.5 text-xs font-medium text-stone-400 hover:text-stone-600">
                Maybe later — take me to my plan
              </button>
            </div>
          </div>
        )}

        {step === 'date' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
                You chose {chosenLabel}.
              </h1>
              <p className="mt-1.5 text-sm text-stone-500">
                Here&apos;s what it costs per day, now that your topics are mapped. Keep it — or pick a calmer date. You own this.
              </p>
            </div>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={busy}
                  onClick={() => chooseDate(opt)}
                  className={cn(
                    'w-full rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-60',
                    i === 0 ? 'border-stone-900 bg-stone-50' : 'border-stone-200 bg-white hover:border-stone-400'
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-base font-bold text-stone-900">{opt.label}</p>
                    <p className="text-xs font-semibold text-stone-500">{i === 0 ? 'Your date' : 'Calmer'}</p>
                  </div>
                  <p className="mt-0.5 text-sm font-semibold text-stone-600">{opt.note}</p>
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-stone-400">≈ estimates from your own coverage map. You can renegotiate the date any time — the plan never lies to you about it.</p>
          </div>
        )}

        {step === 'commit' && (
          <div className="space-y-5 text-center">
            <div>
              <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Commit to your goal</h1>
              <div className="mx-auto mt-4 max-w-xs rounded-2xl border border-violet-100 bg-violet-50/60 p-4 text-left">
                <p className="text-[15px] leading-relaxed text-stone-700">
                  I&apos;m committing to finish my syllabus{chosenLabel ? <> by <span className="font-bold text-violet-700">{chosenLabel}</span></> : null}. I&apos;ll show up daily, log my prep honestly, and trust the plan.
                </p>
              </div>
            </div>
            <HoldToCommit onComplete={() => setStep('thanks')} />
          </div>
        )}

        {step === 'thanks' && (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-3xl shadow-lg shadow-violet-200">🙏</div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Thank you for trusting us.</h1>
              <p className="mt-2 text-sm text-stone-500">We don&apos;t take it lightly. From here on, we work for your date.</p>
            </div>
            <button
              type="button"
              onClick={() => setStep('responsibilities')}
              className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
            >
              Continue →
            </button>
          </div>
        )}

        {step === 'responsibilities' && (
          <div className="space-y-5">
            <div className="text-center">
              <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>The deal, plainly.</h1>
              <p className="mt-1.5 text-sm text-stone-500">Two jobs. You do yours, we do ours.</p>
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl border-2 border-stone-900 p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Your daily job</p>
                <ul className="mt-2 space-y-1.5">
                  {['Complete your study plan', 'Log your prep — right here'].map((t) => (
                    <li key={t} className="flex items-center gap-2 text-sm font-medium text-stone-800">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[9px] text-white">✓</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Our daily job</p>
                <ul className="mt-2 space-y-1.5">
                  {['Remind you, every day', 'Track your strengths & weak spots', 'Plan tomorrow, so you never guess'].map((t) => (
                    <li key={t} className="flex items-center gap-2 text-sm font-medium text-stone-800">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-200 text-[9px] text-stone-700">✓</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={finish}
              className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? 'Starting…' : "Let's start →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
