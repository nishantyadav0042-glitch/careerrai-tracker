'use client';

import { useEffect, useRef, useState } from 'react';
import { SESSION_PRICING } from '@/lib/plans';
import Link from 'next/link';
import { X } from 'lucide-react';
import { UnlockBuddyButton } from '@/components/unlock-buddy-sheet';
import { claimDailyModal, NUDGE_SETTLE_MS } from '@/lib/daily-modal';
import { track } from '@/lib/journey';
import { TOUR_DONE_EVENT, NOTIF_ASK_SETTLED_EVENT, INSIGHT_DONE_EVENT, tourDone, notifAskVisible, insightVisible, logModalOpen } from '@/lib/first-run-events';

// A gentle once-a-day nudge for students who don't have an IIM buddy yet.
// Throttled to one appearance per calendar day (localStorage). The parent
// (student layout) only mounts this for buddy-less, non-premium students.
//
// Founder order (21 July — it used to stack ON TOP of the running app tour):
// this is LAST in the first-run queue. It waits for (1) the notification ask
// to settle, (2) the app tour to be completed, and (3) the log modal to not
// be open — and only THEN claims the daily-modal slot, so a blocked attempt
// doesn't burn today's slot.

// Which control closed it. A tap on the backdrop is a reflex; "Maybe tomorrow"
// is a considered no. Reading them as one number loses the only interesting
// thing about a dismissal. Closed union so the call sites cannot drift into
// free text.
type DismissVia = 'backdrop' | 'close' | 'maybe_tomorrow';

// Which gate stopped the pitch. Closed union for the same reason DismissVia is
// one: these names are the whole answer to "why is this surface silent?", and a
// free-text gate would let two spellings of the same cause look like two causes.
// Ordered as the code checks them.
type NudgeGate =
  | 'tour_unfinished'      // the app tour is still running
  | 'notif_ask_open'       // the push permission ask owns the screen
  | 'insight_open'         // the day-1 Career Insight owns the screen
  | 'log_modal_open'       // the student is logging — never interrupt that
  | 'daily_slot_taken'     // localStorage: another auto-modal has today
  | 'already_pitched_today'// the SERVER says this study day is already pitched
  | 'claim_failed'         // the claim errored and failed closed — a lost pitch
  | 'claim_unreachable';   // the request never produced an answer at all

export function DailyBuddyNudge({ fullName }: { fullName?: string }) {
  const [show, setShow] = useState(false);
  const mounted = useRef(false);
  const lastGate = useRef<NudgeGate | null>(null);

  // The single-session rung also calls setShow(false) and is NOT one of these — it is a
  // conversion, and counting it as an exit would make the rung look like it
  // repels students.
  const dismiss = (via: DismissVia) => {
    track('buddy_nudge_dismissed', { via });
    setShow(false);
  };

  useEffect(() => {
    // WHY THE NUDGE DID NOTHING (15 Sep). Production: 124 `buddy_nudge_shown`
    // all-time and ZERO since 1 Sep — the day the push ask began rendering on
    // every app open. Six different bail-outs share one symptom (silence), and
    // the conversion at stake is the best surface we have: 28 of 124 shown
    // modals reached the CTA (22.6%), against 28 of 3,458 evening pushes
    // (0.8%). Nothing stored could say WHICH gate was closing, so any fix
    // would have been a guess dressed as a decision.
    //
    // The mount now reports itself before any gate can bail, and every bail
    // names its gate — the same shape as `push_ask_mounted`
    // (NOTIFICATION-OS §8: every stage measured). This changes no priority and
    // shows the modal to no student it did not already reach; it only makes
    // the silence readable. The fix comes after the data, not before it.
    if (!mounted.current) { mounted.current = true; track('buddy_nudge_mounted', {}); }
    // At most one row per distinct gate per mount: attempt() re-runs on each of
    // three first-run events, and a student whose tour is unfinished must not
    // write four identical rows for one page view.
    const blocked = (gate: NudgeGate) => {
      if (lastGate.current === gate) return;
      lastGate.current = gate;
      track('buddy_nudge_blocked', { gate });
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    let shown = false;
    const attempt = () => {
      if (shown) return;
      if (timer) clearTimeout(timer);
      // Settle first: lets the notif ask evaluate and the first-log prompt
      // (700ms after tour) claim the screen if they're going to — and, since
      // 16 Sep, lets the one-time concept-resource announcement claim the
      // shared daily slot ahead of this on the single day it appears.
      // NUDGE_SETTLE_MS > ANNOUNCE_SETTLE_MS is the whole of that priority;
      // see the note in lib/daily-modal.ts (Incident #92).
      timer = setTimeout(() => {
        if (shown) return;
        // Unchanged order, unchanged verdicts — each one now says its name.
        if (!tourDone()) return blocked('tour_unfinished');
        if (notifAskVisible()) return blocked('notif_ask_open');
        if (insightVisible()) return blocked('insight_open');
        if (logModalOpen()) return blocked('log_modal_open');

        // TWO gates, in order, and only the second one is the law.
        //
        // claimDailyModal() (localStorage) stays as the cheap FIRST check —
        // it still arbitrates the shared one-auto-modal-per-day slot against
        // the timetable prompt without a network call. But it is per-browser
        // and fails open, which is exactly how the founder's one-pitch-a-day
        // rule was being broken by a second device or a blocked storage jar.
        //
        // The SERVER claim is the authority (promo_impressions, one row per
        // student per study day, all channels — including the evening
        // notification). It fails CLOSED: no proof the day is unpitched, no
        // pitch. Claimed only here, at the moment of showing, so a mount that
        // never happens cannot burn the day's slot.
        if (!claimDailyModal()) return blocked('daily_slot_taken');
        void fetch('/api/promo/claim', { method: 'POST' })
          .then((r) => r.json())
          .then((claim: { show?: boolean; reason?: string }) => {
            if (claim?.show === true && !shown) {
              shown = true; setShow(true); track('buddy_nudge_shown', {});
              return;
            }
            // The server's own two answers, kept apart: a day already pitched
            // (the rule working) is not a claim that errored (the rule
            // failing closed and costing a pitch nobody made).
            blocked(claim?.reason === 'claim_failed' ? 'claim_failed' : 'already_pitched_today');
          })
          .catch(() => { blocked('claim_unreachable'); /* fail closed: no proof, no pitch */ });
      }, NUDGE_SETTLE_MS);
    };
    attempt();
    window.addEventListener(TOUR_DONE_EVENT, attempt);
    window.addEventListener(NOTIF_ASK_SETTLED_EVENT, attempt);
    window.addEventListener(INSIGHT_DONE_EVENT, attempt);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(TOUR_DONE_EVENT, attempt);
      window.removeEventListener(NOTIF_ASK_SETTLED_EVENT, attempt);
      window.removeEventListener(INSIGHT_DONE_EVENT, attempt);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-stone-900/50 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={() => dismiss('backdrop')}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => dismiss('close')}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-2xl shadow">🤝</div>
        <h2 className="text-center text-lg font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Don&apos;t prep alone
        </h2>
        {/* Says what a buddy DOES, not what it causes. The line this replaced
            asserted an outcome — that having a buddy makes students consistent
            and fixes their weak areas — on the strength of 7 premium students
            and 1 session request. The mechanism below is true today and needs
            no cohort to prove it. Deliberately NOT quoting the retired claim
            here: buddy-entry-rung.test.ts guards this file at the source level
            and cannot tell a comment from rendered JSX, so reproducing the
            forbidden string would keep that guard red forever. */}
        <p className="mx-auto mt-1 max-w-xs text-center text-sm text-stone-600">
          An IIM senior who has cleared CAT, working on your prep with you. Here&apos;s what that looks like:
        </p>

        <ul className="mx-auto mt-4 max-w-xs space-y-2 text-sm text-stone-700">
          <li className="flex gap-2"><span>🎯</span> A plan for tomorrow, built from today&apos;s study</li>
          <li className="flex gap-2"><span>📊</span> Every mock decoded with you — each error named</li>
          <li className="flex gap-2"><span>🎥</span> A weekly 1-on-1 video session</li>
        </ul>

        {/* Fires alongside the sheet's own `buddy_unlock_open`, which carries no
            source and is mounted from three places — so today nobody can say
            which surface produced any of it. This does not fix that (see
            G12-A); it does let a `buddy_unlock_open` preceded by
            `buddy_nudge_cta` in the same session be attributed to the nudge.
            Capture phase on the wrapper rather than a prop on the shared button:
            this gate does not change a component two other surfaces mount. The
            button is w-full inside a div with no padding, so the dead zone that
            could over-count is effectively nil. */}
        <div className="mt-5" onClickCapture={() => track('buddy_nudge_cta', {})}>
          <UnlockBuddyButton fullName={fullName} className="w-full">
            See how a buddy helps →
          </UnlockBuddyButton>
        </div>

        {/* The entry rung. A student who is not ready for ₹999+ can buy ONE
            session instead of nothing — the cheapest real step, which existed
            in the product but appeared nowhere on this path.
            It LINKS rather than sells: BookSessionCard checks mentor
            availability before it renders a button, and total capacity is 21
            sessions a week. Charging from here would sell time the mentors
            cannot give, which is precisely what that card exists to prevent. */}
        <Link
          href="/student/buddy"
          onClick={() => { track('buddy_nudge_rung', {}); setShow(false); }}
          className="mt-3 block rounded-xl border border-stone-200 px-4 py-2.5 text-center text-[13px] text-stone-700 transition-colors hover:border-stone-400"
        >
          Not ready for that? <span className="font-semibold text-stone-900">Try one session — {SESSION_PRICING.display}</span>
        </Link>

        <button
          type="button"
          onClick={() => dismiss('maybe_tomorrow')}
          className="mt-2 w-full text-center text-xs text-stone-400 hover:text-stone-600"
        >
          Maybe tomorrow
        </button>
      </div>
    </div>
  );
}
