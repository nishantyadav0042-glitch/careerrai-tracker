'use client';

import { useState, useRef, useEffect } from 'react';
import { InstallButton } from '@/components/install/install-button';
import { InstallLiveGuide } from '@/components/install/install-live-guide';
import { cn } from '@/lib/utils';
import { trackMeta } from '@/lib/track';
import { enablePush, type EnablePushResult } from '@/lib/push-subscribe';

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

// The setup journey, made visible (founder, 21 July: "it should feel like a
// journey, not a boring job — sticky like a magnet till app notifications are
// on"). Five stations, always on screen: what's done gets a tick, the current
// one pulses, and the unfinished ones PULL — the student can see exactly how
// close the finish line is, and the finish line is reminders ON in the app.
const JOURNEY = ['Install', 'Open app', 'Commit', 'Ready'] as const;

function JourneyRail({ current }: { current: number }) {
  return (
    <div className="mb-5">
      <div className="flex items-center">
        {JOURNEY.map((label, i) => (
          <div key={label} className={i === 0 ? 'flex items-center' : 'flex flex-1 items-center'}>
            {i > 0 && <div className={`h-0.5 flex-1 ${i <= current ? 'bg-stone-900' : 'bg-stone-200'}`} />}
            <div
              className={
                'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold ' +
                (i < current
                  ? 'bg-stone-900 text-white'
                  : i === current
                    ? 'bg-orange-500 text-white ring-4 ring-orange-100'
                    : 'bg-stone-200 text-stone-500')
              }
            >
              {i < current ? '✓' : i + 1}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        <span className="text-[9px] font-semibold text-stone-400">{JOURNEY[0]}</span>
        <span className={`text-[9px] font-bold ${current >= JOURNEY.length - 1 ? 'text-orange-600' : 'text-stone-400'}`}>{JOURNEY[JOURNEY.length - 1]}</span>
      </div>
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

type Step = 'date' | 'commit' | 'thanks' | 'notifications' | 'installFirst' | 'openApp';

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
  const [isApp, setIsApp] = useState(false); // standalone read is client-only — starts false to match SSR
  const [busy, setBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushState, setPushState] = useState<EnablePushResult | null>(null);

  // A new student has completed onboarding — the signup conversion for ad
  // campaigns. MUST fire once per student, but this sequence re-renders on
  // every visit until post_signup_done flips (and on iOS it remounts after the
  // /app install-guide round-trip) — which is exactly how Meta ended up
  // counting ~2x more "leads" than real signups. localStorage guard = one
  // conversion per device, ever.
  useEffect(() => {
    try {
      if (localStorage.getItem('cr_meta_reg_fired') === '1') return;
      localStorage.setItem('cr_meta_reg_fired', '1');
    } catch { /* storage blocked — fire anyway, better one dupe than zero signal */ }
    trackMeta('CompleteRegistration');
  }, []);

  const hasDateStep = !!targetIso && hoursLeft > 0;

  // Permission architecture (22 July, evidence-backed): NO notification
  // permission is requested here. This sequence runs pre-install, in the
  // browser, and production data showed browser-context subscriptions dying at
  // ~75% (vs ~8% for installed-app subscriptions). We ask for push ONLY inside
  // the installed app, right after the first Career Insight (StandaloneNotifAsk)
  // — so the subscription is born in its permanent home and never has to
  // survive the browser→WebAPK transition.
  //
  // ONE DATE (founder, 23 July): the finish date is decided ONCE, in onboarding,
  // where the capacity contradiction is highlighted (the red reality-check on the
  // hours screen). This ceremony NO LONGER re-opens the date — a second date
  // decision here is exactly what silently turned a student's onboarding pick
  // into a different date (Pranav's "6 weeks" → 23 Aug). 'commit' DISPLAYS the
  // onboarding date as a commitment, never re-decides it.
  //
  // Install-FIRST (founder, 23 July): a browser-tab lead who never installs is
  // functionally dead to us — push dies at ~75% in-browser vs ~8% installed.
  // Install now runs BEFORE commitment, not as the finale: while the student
  // does the commit ritual, the app has a chance to already be ready in the
  // background, so the close of the ceremony can genuinely say "open your plan
  // in the app" instead of ending in a browser tab. Skippable throughout — a
  // hard, unskippable gate would trade real signups for an unverifiable iOS
  // manual step (no page-level signal ever confirms an iOS Add-to-Home-Screen
  // completed), and we already saw that exact dead-end fail tonight.
  // Flow: installFirst → openApp → commit → thanks → share.
  const [step, setStep] = useState<Step>('installFirst');

  // Already running standalone (e.g. the ceremony re-mounted after an iOS
  // install round-trip) — nothing to install, skip straight to commitment.
  useEffect(() => {
    const standalone = isStandalone();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- display-mode read is client-only
    setIsApp(standalone);
    if (standalone) setStep('commit');
  }, []);

  // Retained only for the (now-unused) notifications/date screens' hand-off
  // targets, kept so the enum stays exhaustive without a dead entry path.
  const afterNotifications: Step = hasDateStep ? 'date' : 'commit';

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

  // Closes the ceremony after the commit ritual. Marked done here (not at the
  // start) so a student who closes the tab mid-install still gets the
  // commitment ritual on their next visit — install itself stays skippable
  // throughout and never blocks reaching this point. Closing reveals the
  // study plan (this overlay sits on top of /student/tracker) — the final
  // "open your study plan in the app" beat.
  const finishCommitment = async () => {
    setBusy(true);
    await persist({ done: true });
    setBusy(false);
    setVisible(false);
  };

  // The whole point of the sequence: ask for push permission at peak intent,
  // right after the commitment ceremony — not deferred to a later gate most
  // students never reach. enablePush() subscribes AND flips notif_prefs.push on
  // the server, so a granted student is immediately reachable by dispatch().
  // A denial / iOS-needs-install / error never blocks the flow — we show the
  // note and let them continue.
  const turnOnReminders = async () => {
    setPushBusy(true);
    const result = await enablePush();
    setPushState(result);
    setPushBusy(false);
    if (result === 'granted') setTimeout(() => setStep(afterNotifications), 900);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-6 py-10">

        {step === 'installFirst' && (
          <div className="space-y-6 text-center">
            <JourneyRail current={0} />
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-900 text-3xl">📲</div>
            <div>
              <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
                First, let&apos;s get your app ready.
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                We remind you <b>what to study</b> and <b>when</b>, and send a <b>daily insight every evening</b> — all of it reaches you only through the installed app. ~3 MB, once.
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <InstallButton variant="banner" />
              <button
                type="button"
                onClick={() => setStep('openApp')}
                className="w-full py-2.5 text-xs font-medium text-stone-400 hover:text-stone-600"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {step === 'openApp' && (
          <div className="space-y-5 text-center">
            <JourneyRail current={1} />
            <div>
              <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
                App downloaded? Open CareerRai in the app now.
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                Didn&apos;t get the install popup? The 10-second route:
              </p>
            </div>
            <InstallLiveGuide />
            <button
              type="button"
              onClick={() => setStep('commit')}
              className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
            >
              Done — continue →
            </button>
          </div>
        )}

        {step === 'date' && (
          <div className="space-y-5">
            <JourneyRail current={0} />
            <div>
              <h1 className="text-xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
                You chose {chosenLabel} to finish your CAT syllabus.
              </h1>
              <p className="mt-1.5 text-sm text-stone-500">
                Here&apos;s what that costs per day, now that your topics are mapped. Keep it — or pick a calmer finish date. You own this.
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
            <JourneyRail current={2} />
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
            <JourneyRail current={3} />
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-3xl shadow-lg shadow-violet-200">🙏</div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>That hold meant something.</h1>
              <p className="mt-2 text-sm text-stone-500">
                {chosenLabel ? <>You committed to <b>{chosenLabel}</b>. </> : null}
                {isApp ? 'Your app is ready — see your plan now.' : 'Thanks for trusting us. Now see your study plan in the app.'}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={finishCommitment}
              className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-60"
            >
              See my plan →
            </button>
          </div>
        )}

        {step === 'notifications' && (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-3xl shadow-lg shadow-orange-200">🔔</div>
            <div>
              <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
                First things first — switch on your reminders.
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                You&apos;re in 🎉 Now the one thing that makes this work: reminders. A plan you forget is a plan you drop — we&apos;ll nudge you at the right time every day with your task, your streak, your weak spots. This is how your plan reaches you.
              </p>
            </div>

            {pushState === 'granted' ? (
              <div className="mx-auto flex max-w-xs flex-col items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-lg text-white">✓</span>
                <p className="text-sm font-semibold text-emerald-700">Reminders are on. We&apos;ve got you.</p>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={turnOnReminders}
                  className="w-full rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
                >
                  {pushBusy ? 'Turning on…' : '🔔 Switch on reminders'}
                </button>

                {pushState === 'denied' && (
                  <p className="px-2 text-[11px] leading-snug text-rose-500">
                    Notifications are blocked in your browser. Open your browser settings for this site and allow notifications — then you&apos;re set.
                  </p>
                )}
                {pushState === 'ios_needs_install' && (
                  <p className="px-2 text-[11px] leading-snug text-stone-500">
                    On iPhone, reminders switch on right after you install the app (coming up at the end). Keep going.
                  </p>
                )}
                {(pushState === 'unsupported' || pushState === 'error') && (
                  <p className="px-2 text-[11px] leading-snug text-stone-500">
                    We couldn&apos;t turn them on here — installing the app (coming up at the end) fixes this. Keep going.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setStep(afterNotifications)}
                  className="w-full py-2.5 text-xs font-medium text-stone-400 hover:text-stone-600"
                >
                  {pushState ? 'Continue →' : 'Maybe later'}
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
