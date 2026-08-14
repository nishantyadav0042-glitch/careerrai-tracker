'use client';

import { useState, useEffect } from 'react';
import { InstallButton } from '@/components/install/install-button';
import { AndroidInstallGuide } from '@/components/install/android-install-guide';
import { useInstall } from '@/lib/install/use-install';
import { trackMeta } from '@/lib/track';
import { enablePush, type EnablePushResult } from '@/lib/push-subscribe';
import { SixPromises } from '@/components/six-promises';
import ScreenLogTour from '@/app/student/onboarding/screens/screen-log-tour';
import { WhatsAppOptIn } from '@/components/onboarding/whatsapp-optin';

// The setup journey, made visible (founder, 21 July: "it should feel like a
// journey, not a boring job — sticky like a magnet till app notifications are
// on"). Five stations, always on screen: what's done gets a tick, the current
// one pulses, and the unfinished ones PULL — the student can see exactly how
// close the finish line is, and the finish line is reminders ON in the app.
// iPhone has one fewer station than Android, and that is the point (10 Aug):
// the App Store hands the app over in one tap, so there is no "here is how to
// add it to your Home Screen" step to walk through. Showing a station we then
// skip would leave a visible gap in the rail on the smoothest journey we have.
const JOURNEY = ['Install', 'Open app', 'What we do', 'Ready'] as const;
const JOURNEY_IPHONE = ['Install', 'What we do', 'Ready'] as const;

function JourneyRail({ current, stations }: { current: number; stations: readonly string[] }) {
  return (
    <div className="mb-5">
      <div className="flex items-center">
        {stations.map((label, i) => (
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
        <span className="text-[9px] font-semibold text-stone-400">{stations[0]}</span>
        <span className={`text-[9px] font-bold ${current >= stations.length - 1 ? 'text-orange-600' : 'text-stone-400'}`}>{stations[stations.length - 1]}</span>
      </div>
    </div>
  );
}

// Props are gone: this sequence used to re-open the finish-date decision here
// (which silently overwrote the date students picked in onboarding — Pranav's
// "6 weeks" became 23 Aug). The date is decided ONCE, in onboarding. Nothing
// here needs it any more.


type Step = 'promises' | 'reminders' | 'logTour' | 'whatsapp' | 'installFirst' | 'openApp';

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
export default function PostSignupSequence({ regEventId }: { regEventId?: string }) {
  const [visible, setVisible] = useState(true);
  // iPhone's whole install is one tap on the App Store card, so the "here's how
  // to add it" screen that follows is not just unnecessary — it is a step that
  // asks a student who has already finished to keep going.
  const { ui: installUi } = useInstall();
  const isIphone = installUi === 'ios-app-store';
  const stations = isIphone ? JOURNEY_IPHONE : JOURNEY;
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
    // Same event id as the server's Conversions API event (the user id, from
    // student/layout) — Meta dedups the pair into ONE registration. The server
    // event is the reliable one; this browser copy adds the pixel's own
    // signals when it survives ad-blockers.
    trackMeta('CompleteRegistration', undefined, regEventId);
  }, [regEventId]);


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
  // On iPhone the openApp station is skipped entirely (10 Aug) — the App Store
  // installs the app itself, so there is nothing left to walk anyone through.
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
    // ── The screen a student could get STUCK on (founder, 13 Aug) ──────────
    //
    // This was `fixed inset-0 flex flex-col` with no overflow rule. A fixed
    // element does not scroll by default, so on any phone where the content
    // ran past the viewport — which is every phone, on the six-promises step
    // — the rest of the screen was simply unreachable. The forward button sat
    // below the fold with no way to reach it: a dead end one step after
    // signup, on the exact screen that introduces the product.
    //
    // `overflow-y-auto` on the fixed layer + `min-h-full` on the inner column
    // is the safe pairing: when content is short the column still fills the
    // screen and `justify-center` centres it; when content is tall the column
    // grows past the viewport, centring becomes a no-op, and the whole thing
    // scrolls instead of clipping. Centring alone (without the scroll layer)
    // is what made the top AND bottom unreachable at once.
    <div className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-5 py-6">

        {step === 'installFirst' && (
          <div className="space-y-6 text-center">
            <JourneyRail current={0} stations={stations} />
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-900 text-3xl">📲</div>
            <div>
              <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
                First, let&apos;s get your app ready.
              </h1>
              {/* "~3 MB" was a PWA fact and stopped being true for iPhone the
                  day the App Store build shipped — the card states the real
                  size per platform now, so this line no longer guesses. */}
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                We remind you <b>what to study</b> and <b>when</b>, and send a <b>daily insight every evening</b> — all of it reaches you only through the app. One download, once.
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <InstallButton variant="banner" />
              <button
                type="button"
                onClick={() => setStep(isIphone ? 'promises' : 'openApp')}
                className="w-full py-2.5 text-xs font-medium text-stone-400 hover:text-stone-600"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {step === 'openApp' && (
          <div className="space-y-5 text-center">
            <JourneyRail current={1} stations={stations} />
            <div>
              <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
                App downloaded? Open CareerRai in the app now.
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                Not there yet? The 10-second route:
              </p>
            </div>
            <AndroidInstallGuide />
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
            <JourneyRail current={isIphone ? 1 : 2} stations={stations} />
            {/* The hold-to-commit ceremony used to live here — a ritual that
                asked the student for a promise before we had named a single
                thing we do for them. Backwards. The app commits first, out
                loud; the student's one job is named last. */}
            <SixPromises onNext={() => { void persist({ done: true }); setStep('reminders'); }} />
          </div>
        )}

        {step === 'reminders' && (
          <div className="space-y-6 text-center">
            <JourneyRail current={isIphone ? 2 : 3} stations={stations} />
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-3xl shadow-lg shadow-orange-200">🔔</div>
            <div>
              <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
                Now let us do the six.
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                A separate step on purpose — the six are yours whether you tap this or not. But this is
                how they reach you.
              </p>
            </div>

            {/* Three concrete jobs, in the founder's own order: what to do,
                what you missed, what's done. A permission ask that lists what
                the notification will SAY is answerable; "allow notifications"
                is not. */}
            <ul className="mx-auto max-w-xs space-y-2 text-left">
              {[
                { t: 'What to do today', s: 'Your plan, the moment it\u2019s ready' },
                { t: 'What you missed', s: 'Revision due, mock day, plan running out' },
                { t: 'What\u2019s done', s: 'Day closed, and what it means for your date' },
              ].map((x) => (
                <li key={x.t} className="flex gap-2.5 rounded-xl bg-stone-50 px-3 py-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                  <div>
                    <p className="text-[13.5px] font-bold leading-tight text-stone-900">{x.t}</p>
                    <p className="text-[12px] leading-tight text-stone-500">{x.s}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div>
              <p className="text-[12px] font-medium text-stone-400">
                <b className="text-stone-600">Never spam, never marketing</b> — only your own preparation.
              </p>
            </div>

            {pushState === 'granted' ? (
              <div className="mx-auto flex max-w-xs flex-col items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-lg text-white">✓</span>
                <p className="text-sm font-semibold text-emerald-700">Done. We&apos;ve got you from here.</p>
                <button
                  type="button"
                  onClick={() => setStep('logTour')}
                  className="mt-1 w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
                >
                  Last thing →
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
                  onClick={() => setStep('logTour')}
                  className="w-full py-2.5 text-xs font-medium text-stone-400 hover:text-stone-600"
                >
                  {pushState ? 'Last thing →' : 'Maybe later'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── The last screen before Home: practise the log ──────────────────
            Built 13 Aug and wired into onboarding-modal — which turned out to
            be unreachable for anyone who signs up through /start, because
            that route marks onboarding_completed server-side, so the modal
            never renders. Every real student therefore finished setup without
            ever seeing it. It belongs here: this sequence IS the last thing
            between signup and Home.

            Practice only — writes nothing, and skippable (Incident #2). */}
        {step === 'logTour' && (
          <div className="space-y-4">
            <JourneyRail current={stations.length - 1} stations={stations} />
            <ScreenLogTour
              onNext={async () => { setStep('whatsapp'); }}
              onBack={() => setStep('reminders')}
              canGoBack
              isLoading={false}
            />
          </div>
        )}

        {/* ── The last screen before Home ────────────────────────────────
            Reach, not onboarding: 87% finish the sequence, but 64% never log
            a day, 49% never return after day one, and only 31% have working
            push. Every student has a phone number, so WhatsApp is the only
            channel that covers the two-thirds push cannot — and this is the
            last controlled moment before that drop.
            Skippable; nothing here gates Home. */}
        {step === 'whatsapp' && (
          <div className="space-y-4">
            <JourneyRail current={stations.length - 1} stations={stations} />
            <WhatsAppOptIn onDone={finishCommitment} />
          </div>
        )}

      </div>
    </div>
  );
}
