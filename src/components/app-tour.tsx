'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NOTIF_ASK_SETTLED_EVENT, notifAskVisible, TOUR_KEY, FIRST_LOG_GUIDE_KEY, timetableAskVisible, TIMETABLE_ASK_SETTLED_EVENT, setTourVisible } from '@/lib/first-run-events';
import { track } from '@/lib/journey';

// Spotlight coach-mark tour (founder: "we never gave a quick app tour").
// Dims the screen and cuts a spotlight over one real element at a time, with a
// tooltip. Runs ONCE (localStorage flag); replayable from Settings by clearing
// the flag. Targets are marked with data-tour="…" on the real components, so the
// tour points at the actual buttons, not a mockup.
//
// WHEN it runs (founder: "why is the tour starting on the reminders screen
// instead of after app installation"): the tour fires only when `enabled` is
// true (parent has cleared onboarding + post-signup) AND the app is actually
// installed — running in standalone display mode, never a browser tab. That's
// the settled home screen, which is exactly where a "quick tour" belongs.
// On finish it fires TOUR_DONE_EVENT — the founder's in-app sequence is
// notifications → tour → tiny insight cloud, so the cloud listens for this.
//
// THE FIRST-LOG GUIDE (24 Sep, founder: "build it now in our own tour, you
// decide"). Measured that day: 72 installed students had opened the app in 14
// days, cleared every onboarding gate, and never logged. Most of them had
// already had this tour, which spent one step on the plan card and told them
// to "tap its circle" — a gesture that stopped being the log on 16 Aug, when
// the whole task card became the target. So the tour now:
//   1. points at the REAL first task (data-tour="first-task"), not the plan,
//      and names the two choices exactly as the card shows them;
//   2. runs ONE more time for a student who has never logged, even if they saw
//      the old tour (FIRST_LOG_GUIDE_KEY), and never for anyone who has;
//   3. records itself (app_tour_started / _step / _finished), so whether a
//      finished tour is followed by a first log can be read from data instead
//      of guessed. The old tour had no telemetry at all.
interface TourStep { id: string; sel: string; title: string; body: string }

const STEPS: TourStep[] = [
  { id: 'plan', sel: '[data-tour="plan"]', title: 'Your plan for today', body: 'Built around the highest-scoring CAT topics for exactly where you are. Each task tells you why it’s there.' },
  { id: 'daily-pick', sel: '[data-tour="daily-pick"]', title: 'Hint of the day 💡', body: 'One CAT hint a day, the most useful first. It takes twenty seconds to read.' },
  { id: 'buddy', sel: '[data-tour="buddy"]', title: 'Your IIM buddy', body: 'Your 1:1 IIM buddy reviews your prep and tells you what to fix — right here.' },
  // LAST, on purpose: the tour ends on the one action that matters, pointing
  // at the real first task. Founder, 13 Aug: "just guide the new students the
  // way they can log." Skipped automatically when there is no
  // open task on screen (the step's target is then absent).
  { id: 'first-task', sel: '[data-tour="first-task"]', title: 'Start here', body: 'This is your first task. When you finish it, or get halfway, tap it and choose Finished it or Got halfway. That is your whole log for today.' },
];
const KEY = TOUR_KEY;
// Broadcast the moment the tour ends so the buddy pitch and first-log prompt
// can take their turn — the founder's order is notifications → tour → buddy.
export { TOUR_DONE_EVENT } from '@/lib/first-run-events';
import { TOUR_DONE_EVENT } from '@/lib/first-run-events';

export type TourRun = 'first_run' | 'never_logged';

/** Who gets the tour on this device. Anyone who has never had one; plus, ONCE,
 *  a student who had one and has still never logged. Anyone who has logged and
 *  had a tour: never again. Pure, so the rule is tested without a browser. */
export function tourRunFor(s: { hadTour: boolean; hadGuide: boolean; neverLogged: boolean }): TourRun | null {
  if (!s.hadTour) return 'first_run';
  if (s.neverLogged && !s.hadGuide) return 'never_logged';
  return null;
}

export function AppTour({ enabled = false, neverLogged = false }: { enabled?: boolean; neverLogged?: boolean }) {
  const [idx, setIdx] = useState(-1);      // -1 not started, -2 finished
  const [rect, setRect] = useState<DOMRect | null>(null);
  // Which run this is, fixed when it starts: a first tour, or the one extra
  // run for a student who has had a tour and never logged.
  const [variant, setVariant] = useState<TourRun>('first_run');
  // Starts once per mount. Without this, a second "notification ask settled"
  // event arriving mid-tour called setIdx(0) again and sent the student back
  // to step 1.
  const started = useRef(false);
  // Leaving the page mid-tour must not leave the flag set for the session.
  useEffect(() => () => setTourVisible(false), []);

  const measure = useCallback((i: number): DOMRect | null => {
    const step = STEPS[i];
    if (!step) return null;
    const el = document.querySelector(step.sel) as HTMLElement | null;
    if (!el) return null;
    return el.getBoundingClientRect();
  }, []);

  const finish = useCallback((completed: boolean, at: string | null) => {
    // Both keys: TOUR_KEY keeps meaning "has had a tour" for the surfaces that
    // wait on it, and the guide key stops the never-logged re-run repeating.
    try { localStorage.setItem(KEY, '1'); localStorage.setItem(FIRST_LOG_GUIDE_KEY, '1'); } catch { /* ignore */ }
    track('app_tour_finished', { variant, completed, at });
    setTourVisible(false);
    setIdx(-2);
    // Tour's over — cue the "switch on notifications" ask to come up next.
    try { window.dispatchEvent(new Event(TOUR_DONE_EVENT)); } catch { /* ignore */ }
  }, [variant]);

  // Start once, after the page has settled — but ONLY in the installed app,
  // only once the parent says every higher-priority overlay is cleared, and
  // NEVER while the notification ask is on screen (founder order, 21 July:
  // notifications first, THEN the tour — they used to stack).
  useEffect(() => {

    if (!enabled) return;
    // Installed-app only: a browser tab still shows the address bar and the
    // reminders/install prompts, so the tour there lands on the wrong screen.
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { standalone?: boolean }) : null;
    const standalone =
      (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
      nav?.standalone === true;
    if (!standalone) return;
    // Who gets it: anyone who has never had a tour, plus — once — anyone who
    // had one and has still never logged. A student who logs never sees it
    // again.
    let runAs: TourRun | null;
    try {
      runAs = tourRunFor({
        hadTour: !!localStorage.getItem(KEY),
        hadGuide: !!localStorage.getItem(FIRST_LOG_GUIDE_KEY),
        neverLogged,
      });
    } catch { return; }
    if (!runAs) return;
    const run: TourRun = runAs;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tryStart = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (started.current || notifAskVisible() || timetableAskVisible()) return;
        started.current = true;
        setTourVisible(true);
        setVariant(run);
        track('app_tour_started', { variant: run, steps: STEPS.length });
        setIdx(0);
      }, 900);
    };
    tryStart();
    // Notification ask just settled (enabled → page reloads; "Later" → event).
    window.addEventListener(NOTIF_ASK_SETTLED_EVENT, tryStart);
    // Stage A: the coaching-timetable ask outranks the tour in the first days.
    window.addEventListener(TIMETABLE_ASK_SETTLED_EVENT, tryStart);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(NOTIF_ASK_SETTLED_EVENT, tryStart);
      window.removeEventListener(TIMETABLE_ASK_SETTLED_EVENT, tryStart);
    };
  }, [enabled, neverLogged]);

  // On each step: skip steps whose target isn't on screen; scroll it into view;
  // measure (and re-measure after scroll + on resize/scroll).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- deriving the visible
       step + its rect from the DOM is exactly what this effect is for; the
       skip/finish transitions are bounded (≤ STEPS.length) so no render loop. */
    if (idx < 0) return;
    let i = idx;
    while (i < STEPS.length && measure(i) == null) i += 1;
    if (i >= STEPS.length) { finish(true, STEPS[STEPS.length - 1].id); return; }
    if (i !== idx) { setIdx(i); return; }
    track('app_tour_step', { variant, step: STEPS[i].id, n: i + 1 });

    const el = document.querySelector(STEPS[i].sel) as HTMLElement | null;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setRect(measure(i));
    const t = setTimeout(() => setRect(measure(i)), 400);
    const onMove = () => setRect(measure(i));
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { clearTimeout(t); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (idx < 0 || !rect) return null;

  const step = STEPS[idx];
  const pad = 8;
  const below = rect.bottom < (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.58;

  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label="App tour">
      {/* Spotlight: a transparent box over the target; the huge box-shadow dims
          everything else. pointer-events none so it never intercepts taps. */}
      <div
        className="absolute rounded-xl transition-all duration-300"
        style={{
          top: rect.top - pad, left: rect.left - pad,
          width: rect.width + pad * 2, height: rect.height + pad * 2,
          boxShadow: '0 0 0 9999px rgba(15,23,42,0.74)',
          pointerEvents: 'none',
        }}
      />
      <div
        className="absolute left-1/2 w-[min(90vw,20rem)] -translate-x-1/2 rounded-2xl bg-white p-4 shadow-2xl"
        style={below ? { top: rect.bottom + pad + 12 } : { bottom: (typeof window !== 'undefined' ? window.innerHeight : 800) - rect.top + pad + 12 }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Quick tour · {idx + 1}/{STEPS.length}</p>
        <h3 className="mt-1 text-base font-bold text-stone-900">{step.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={() => finish(false, step.id)} className="text-xs font-medium text-stone-400 hover:text-stone-600">Skip</button>
          <button
            type="button"
            onClick={() => (idx >= STEPS.length - 1 ? finish(true, step.id) : setIdx(idx + 1))}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white active:scale-[0.98]"
          >
            {idx >= STEPS.length - 1 ? 'Got it 🎉' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
