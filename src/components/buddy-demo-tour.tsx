'use client';

import { useCallback, useEffect, useState } from 'react';

// The buddy demo tour — buddydemo@careerrai.in is a read-only window into the
// student side, so new buddies can SEE what their mentees live in before their
// first call. The proxy refuses every write from this account; this overlay
// does the "telling them what it tells" part (founder, 4 Aug).
//
// Keyed off the non-httpOnly `cr_demo` cookie stamped at login. Replays once
// per browser session; the banner's Replay button restarts it anytime. Steps
// spotlight real elements when they exist on the current page (same
// data-tour markers the student AppTour uses) and fall back to a centered
// card when they don't — so the tour works from any student page.

interface Step { sel: string | null; title: string; body: string }

const STEPS: Step[] = [
  {
    sel: null,
    title: 'Welcome — this is what your mentee sees 👋',
    body: 'You are inside a demo student account ("Aarav", 99%ile target, 4 hrs/day, weak in VARC). Everything is real app, viewing only — buttons that change data are switched off. Tap through this tour, then explore freely.',
  },
  {
    sel: '[data-tour="plan"]',
    title: "Today's plan",
    body: 'The app builds each day around the student\'s hours, target and weak section — so they never start the morning deciding what to study. Your job as buddy builds on top of this: you steer the week, the app runs the day.',
  },
  {
    sel: '[data-tour="swap"]',
    title: 'Swap — their plan, their call',
    body: 'A student who is not feeling a topic swaps it out; it returns tomorrow. The app adapts rather than guilt-trips — that is deliberate.',
  },
  {
    sel: '[data-tour="log"]',
    title: 'The daily log — the heartbeat',
    body: 'Two minutes every night: what they studied, how long, how it felt. Honest zeros are allowed. THIS is the data you read before every session — streaks, topic map and your advice all run on it.',
  },
  {
    sel: '[data-tour="daily-pick"]',
    title: 'Daily Pick — peers, not loneliness',
    body: 'One tip or question from a fellow aspirant daily; students vote what gets featured. Small, but it makes prep less alone.',
  },
  {
    sel: '[data-tour="buddy"]',
    title: 'The Buddy tab — this is YOU',
    body: 'Paying students get an IIM senior here: chat, 1:1 video sessions, and advice that quotes their actual data. This tab is the promise your onboarding call delivers on.',
  },
  {
    sel: null,
    title: 'Now walk the journey from zero →',
    body: 'Every student BUILT this plan themselves before ever seeing this screen — date, target, hours, and a 53-topic self-assessment, all before signup. Tap "Walk the journey" to experience it: each screen explains itself and auto-fills Aarav\'s answers, you just tap through. Nothing is saved. That\'s A to Z — explore anything after, you can\'t break it.',
  },
];

const SESSION_KEY = 'cr_demo_tour_done';

function hasDemoCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith('cr_demo='));
}

export function BuddyDemoTour() {
  const [demo, setDemo] = useState(false);
  const [idx, setIdx] = useState(-1); // -1 idle, otherwise step index
  const [rect, setRect] = useState<DOMRect | null>(null);

  // The cookie is only readable client-side, and reading it during render
  // would make the server and client disagree (hydration mismatch) — so this
  // is the legitimate mount-once external-system sync case.
  useEffect(() => {
    if (!hasDemoCookie()) return;
    let seen = false;
    try { seen = !!sessionStorage.getItem(SESSION_KEY); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setDemo(true);
    if (!seen) setIdx(0);
  }, []);

  const measure = useCallback((i: number): DOMRect | null => {
    const sel = STEPS[i]?.sel;
    if (!sel) return null;
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    return el.getBoundingClientRect();
  }, []);

  useEffect(() => {
    if (idx < 0) return;
    const t = setTimeout(() => setRect(measure(idx)), 150);
    return () => clearTimeout(t);
  }, [idx, measure]);

  if (!demo) return null;

  const finish = () => {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
    setIdx(-1);
  };
  const step = idx >= 0 ? STEPS[idx] : null;

  return (
    <>
      {/* Always-on banner: buddies must never mistake this for a real student. */}
      <div className="fixed inset-x-0 top-0 z-[95] flex items-center justify-between bg-stone-900 px-3 py-1.5 text-[11px] text-white">
        <span className="font-semibold">🎓 Buddy demo · student view · viewing only</span>
        <button
          type="button"
          onClick={() => { setIdx(0); }}
          className="rounded-full bg-white/15 px-2.5 py-0.5 font-bold"
        >
          Replay tour
        </button>
      </div>

      {step && (
        <div className="fixed inset-0 z-[96]">
          {/* Dim layer with an optional spotlight cutout over the real element. */}
          <div
            className="absolute inset-0"
            style={rect ? {
              background: 'rgba(12,10,9,0.72)',
              clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${rect.top - 8}px, ${rect.left - 8}px ${rect.top - 8}px, ${rect.left - 8}px ${rect.bottom + 8}px, ${rect.right + 8}px ${rect.bottom + 8}px, ${rect.right + 8}px ${rect.top - 8}px, 0 ${rect.top - 8}px)`,
            } : { background: 'rgba(12,10,9,0.72)' }}
          />
          <div
            className="absolute inset-x-4 rounded-2xl bg-white p-4 shadow-2xl"
            style={rect && rect.top > window.innerHeight / 2
              ? { top: Math.max(44, rect.top - 190) }
              : rect
                ? { top: Math.min(window.innerHeight - 220, rect.bottom + 16) }
                : { top: '30%' }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600">
              Tour · {idx + 1} of {STEPS.length}
            </p>
            <h3 className="mt-1 text-base font-bold text-stone-900">{step.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-stone-600">{step.body}</p>
            <div className="mt-3 flex items-center justify-between">
              <button type="button" onClick={finish} className="text-[12px] font-semibold text-stone-400">
                Skip
              </button>
              <div className="flex gap-2">
                {idx + 1 === STEPS.length && (
                  <a
                    href="/start?demo=1"
                    onClick={finish}
                    className="rounded-xl bg-orange-600 px-4 py-2 text-[13px] font-bold text-white"
                  >
                    Walk the journey →
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => (idx + 1 < STEPS.length ? setIdx(idx + 1) : finish())}
                  className="rounded-xl bg-stone-900 px-4 py-2 text-[13px] font-bold text-white"
                >
                  {idx + 1 < STEPS.length ? 'Next →' : 'Explore here'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
