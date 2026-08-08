'use client';

import { useState, useEffect } from 'react';
import { InstallButton } from '@/components/install/install-button';
import { InstallLiveGuide } from '@/components/install/install-live-guide';
import { trackMeta } from '@/lib/track';
import { enablePush, type EnablePushResult } from '@/lib/push-subscribe';
import { SixPromises } from '@/components/six-promises';

// The setup journey, made visible (founder, 21 July: "it should feel like a
// journey, not a boring job — sticky like a magnet till app notifications are
// on"). Five stations, always on screen: what's done gets a tick, the current
// one pulses, and the unfinished ones PULL — the student can see exactly how
// close the finish line is, and the finish line is reminders ON in the app.
const JOURNEY = ['Install', 'Open app', 'What we do', 'Ready'] as const;

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

// Props are gone: this sequence used to re-open the finish-date decision here
// (which silently overwrote the date students picked in onboarding — Pranav's
// "6 weeks" became 23 Aug). The date is decided ONCE, in onboarding. Nothing
// here needs it any more.


type Step = 'promises' | 'reminders' | 'installFirst' | 'openApp';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}


// The whole post-login ceremony, once per student: reconcile the date against
// the real per-day cost → hold-to-commit → thank you → the two-way deal →
// and ONLY THEN the install ask, as the finale (founder: install comes after
// the plan is complete — an install detour mid-ceremony reads as a random
// third screen and breaks the flow, especially on iPhone where it navigates
// to the /app guide). done is persisted BEFORE the install step so the iOS
// navigation away can never re-trigger the ceremony. Gentle violet accents;
// every number is deterministic — the same remainingPrepHours model as the
// Builder, never invented.
export default function PostSignupSequence() {
  const [visible, setVisible] = useState(true);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- display-mode read is client-only
    if (isStandalone()) setStep('promises');
  }, []);

  async function persist(body: Record<string, unknown>) {
    try {
      await fetch('/api/student/post-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch { /* best-effort — the flag/date write is not worth blocking the UI on */ }
  }



  // `done` is persisted the moment the student passes the promises screen,
  // NOT here — so someone who then just opens the installed app (instead of
  // tapping anything else) never re-runs onboarding. This only dismisses the
  // overlay and reveals the tracker underneath.
  const finishCommitment = () => {
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
              onClick={() => setStep('promises')}
              className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
            >
              Done — continue →
            </button>
          </div>
        )}

        {step === 'promises' && (
          <div className="space-y-5">
            <JourneyRail current={2} />
            {/* The hold-to-commit ceremony used to live here — a ritual that
                asked the student for a promise before we had named a single
                thing we do for them. Backwards. The app commits first, out
                loud; the student's one job is named last. */}
            <SixPromises onNext={() => { void persist({ done: true }); setStep('reminders'); }} />
          </div>
        )}

        {step === 'reminders' && (
          <div className="space-y-6 text-center">
            <JourneyRail current={3} />
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-3xl shadow-lg shadow-orange-200">🔔</div>
            <div>
              <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
                One tap so we can keep our word.
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                We said we&apos;d remind you to revise before you forget, and get you back after a bad week.
                Reminders are how. Nothing else — we never spam.
              </p>
            </div>

            {pushState === 'granted' ? (
              <div className="mx-auto flex max-w-xs flex-col items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-lg text-white">✓</span>
                <p className="text-sm font-semibold text-emerald-700">Done. We&apos;ve got you from here.</p>
                <button
                  type="button"
                  onClick={finishCommitment}
                  className="mt-1 w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
                >
                  Open today&apos;s plan →
                </button>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={turnOnReminders}
                  className="w-full rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
                >
                  {pushBusy ? 'Turning on…' : '🔔 Turn on reminders'}
                </button>

                {pushState === 'denied' && (
                  <p className="px-2 text-[11px] leading-snug text-rose-500">
                    Blocked in your browser settings. Allow notifications for this site and you&apos;re set.
                  </p>
                )}
                {pushState === 'ios_needs_install' && (
                  <p className="px-2 text-[11px] leading-snug text-stone-500">
                    On iPhone, reminders switch on once the app is installed — we&apos;ll ask again inside the app.
                  </p>
                )}
                {(pushState === 'unsupported' || pushState === 'error') && (
                  <p className="px-2 text-[11px] leading-snug text-stone-500">
                    Couldn&apos;t turn them on here — installing the app fixes it. Keep going.
                  </p>
                )}

                <button
                  type="button"
                  onClick={finishCommitment}
                  className="w-full py-2.5 text-xs font-medium text-stone-400 hover:text-stone-600"
                >
                  {pushState ? 'Open my plan →' : 'Maybe later'}
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
