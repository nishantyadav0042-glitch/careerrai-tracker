'use client';

import { useState, useEffect } from 'react';
import { InstallButton } from '@/components/install/install-button';
import { AndroidInstallGuide } from '@/components/install/android-install-guide';
import { useInstall } from '@/lib/install/use-install';
import { trackMeta } from '@/lib/track';
import { SixPromises } from '@/components/six-promises';
import ScreenLogTour from '@/app/student/onboarding/screens/screen-log-tour';
import { WhatsAppOptIn, reachOf } from '@/components/onboarding/whatsapp-optin';
import { PlanSnapshot } from '@/components/onboarding/plan-snapshot';

// The setup journey, made visible (founder, 21 July: "it should feel like a
// journey, not a boring job — sticky like a magnet till app notifications are
// on"). Stations, always on screen: what's done gets a tick, the current one
// pulses, and the unfinished ones PULL — the student can see exactly how
// close the finish line is. The finish line moved 15 Aug from "reminders ON"
// to WhatsApp joined — see the note above the whatsapp step for why.
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


type Step = 'promises' | 'logTour' | 'whatsapp' | 'installFirst' | 'openApp';

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
  const { ui: installUi, installed } = useInstall();
  const isIphone = installUi === 'ios-app-store';
  const stations = isIphone ? JOURNEY_IPHONE : JOURNEY;

  // ── WhatsApp is now the ceremony's ONE ask, unconditional ─────────────────
  //
  // Founder, 15 Aug: "even if someone is dead in app we can revive them from
  // WhatsApp — but if someone didn't join WhatsApp and just added the app, we
  // can't revive them." That ranks WhatsApp above push, not alongside it. The
  // reach-weighted two-order dance this used to run (push declined → WhatsApp
  // first; push granted → WhatsApp last, light-touch) is gone along with the
  // reason for it: push permission is no longer asked in this ceremony at
  // all, so there is nothing left to branch the order on. Every student sees
  // WhatsApp, right after the six promises, every time.
  //
  // Push permission moved fully in-app — StandaloneNotifAsk
  // (src/components/standalone-notif-ask.tsx, wired in student/layout.tsx)
  // already asks for it post-signup, inside the installed app, at the exact
  // "peak intent, permanent home" moment the old comment on this file
  // described. That component did not need building; it already existed and
  // already ran after this ceremony finished — the fix here is only to stop
  // ALSO asking a second time, earlier, in the browser.
  //
  // `reachOf` still shapes the WORDING (a student who has installed reads
  // softer copy than one who hasn't), just no longer the ORDER. pushOn is
  // always false here on purpose: at this exact point in the ceremony push
  // has definitionally not been asked yet, so this is accurate, not a guess.
  const reach = reachOf({ installed, pushOn: false });

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

        {/* ── Show the work, THEN ask ────────────────────────────────────
            This screen used to ask for a download on the strength of a
            promise ("we remind you what to study") — the same promise every
            other app on that phone already made. By now we have the student's
            hours, exam date and weak section, so the plan genuinely exists:
            showing it turns the ask from "trust us" into "look what is
            already yours". The snapshot is their real generated day, and it
            renders nothing at all if the plan can't be loaded. */}
        {step === 'installFirst' && (
          <div className="space-y-5 text-center">
            <JourneyRail current={0} stations={stations} />
            <div>
              <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
                Your timetable is ready.
              </h1>
              <p className="mt-1.5 text-sm text-stone-500">
                Built for your hours and your weak section.
              </p>
            </div>

            <PlanSnapshot />

            {/* The reason to install, stated after the proof and in one line:
                the plan is theirs either way, the app is how it arrives. */}
            <p className="text-[13px] leading-relaxed text-stone-500">
              A new one every morning — <b className="text-stone-700">it reaches you only in the app.</b>
            </p>

            <div className="space-y-2">
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
            <SixPromises onNext={() => { void persist({ done: true }); setStep('whatsapp'); }} />
          </div>
        )}

        {/* ── WhatsApp — the ceremony's one ask, right after the six promises.
            Founder, 15 Aug: "even if someone is dead in app we can revive
            them from WhatsApp — but if someone didn't join WhatsApp and just
            added the app, we can't revive them." Every phone number can be
            reached this way; not every install stays reachable. Skippable —
            nothing here gates Home (the Incident #2 shape: a hard gate on an
            action once cost a whole cohort's logging). */}
        {step === 'whatsapp' && (
          <div className="space-y-4">
            {/* Same final rail position "reminders" used to occupy — WhatsApp
                is now the ceremony's finishing ask in its place. */}
            <JourneyRail current={stations.length - 1} stations={stations} />
            <WhatsAppOptIn
              reach={reach}
              onDone={() => setStep('logTour')}
            />
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
              onNext={async () => finishCommitment()}
              onBack={() => setStep('whatsapp')}
              canGoBack
              isLoading={false}
            />
          </div>
        )}

      </div>
    </div>
  );
}
