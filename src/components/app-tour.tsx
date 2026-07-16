'use client';

import { useCallback, useEffect, useState } from 'react';

// Spotlight coach-mark tour (founder: "we never gave a quick app tour").
// Dims the screen and cuts a spotlight over one real element at a time, with a
// tooltip. Runs ONCE (localStorage flag); replayable from Settings by clearing
// the flag. Targets are marked with data-tour="…" on the real components, so the
// tour points at the actual buttons, not a mockup.
//
// WHEN it runs (founder: "why is the tour starting on the reminders screen
// instead of after app installation"): the tour is the LOWEST-priority overlay.
// It fires only when `enabled` is true (parent has cleared onboarding,
// post-signup and the reminders ask) AND the app is actually installed —
// running in standalone display mode, never a browser tab. That's the settled
// home screen, which is exactly where a "quick tour" belongs.
interface TourStep { sel: string; title: string; body: string }

const STEPS: TourStep[] = [
  { sel: '[data-tour="plan"]',  title: 'Your plan for today', body: 'Built around the highest-scoring CAT topics for exactly where you are. Each task tells you why it’s there.' },
  { sel: '[data-tour="swap"]',  title: 'Not feeling a topic?', body: 'Tap ⇄ Swap to change it — your plan, your call. It comes back tomorrow, never lost.' },
  { sel: '[data-tour="log"]',   title: 'Log in 5 seconds',     body: 'Done studying? Log it. This one habit keeps your whole plan on track.' },
  { sel: '[data-tour="buddy"]', title: 'Your IIM buddy',       body: 'A 1:1 IIM mentor who reviews your prep and tells you what to fix — lives right here.' },
];
const KEY = 'cr_app_tour_v1';

export function AppTour({ enabled = false }: { enabled?: boolean }) {
  const [idx, setIdx] = useState(-1);      // -1 not started, -2 finished
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback((i: number): DOMRect | null => {
    const step = STEPS[i];
    if (!step) return null;
    const el = document.querySelector(step.sel) as HTMLElement | null;
    if (!el) return null;
    return el.getBoundingClientRect();
  }, []);

  const finish = useCallback(() => {
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    setIdx(-2);
  }, []);

  // Start once, after the page has settled — but ONLY in the installed app and
  // only once the parent says every higher-priority overlay is cleared.
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    if (!enabled) return;
    // Installed-app only: a browser tab still shows the address bar and the
    // reminders/install prompts, so the tour there lands on the wrong screen.
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { standalone?: boolean }) : null;
    const standalone =
      (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
      nav?.standalone === true;
    if (!standalone) return;
    try { if (localStorage.getItem(KEY)) return; } catch { return; }
    const t = setTimeout(() => setIdx(0), 900);
    return () => clearTimeout(t);
  }, [enabled]);

  // On each step: skip steps whose target isn't on screen; scroll it into view;
  // measure (and re-measure after scroll + on resize/scroll).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- deriving the visible
       step + its rect from the DOM is exactly what this effect is for; the
       skip/finish transitions are bounded (≤ STEPS.length) so no render loop. */
    if (idx < 0) return;
    let i = idx;
    while (i < STEPS.length && measure(i) == null) i += 1;
    if (i >= STEPS.length) { finish(); return; }
    if (i !== idx) { setIdx(i); return; }

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
          <button type="button" onClick={finish} className="text-xs font-medium text-stone-400 hover:text-stone-600">Skip</button>
          <button
            type="button"
            onClick={() => (idx >= STEPS.length - 1 ? finish() : setIdx(idx + 1))}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white active:scale-[0.98]"
          >
            {idx >= STEPS.length - 1 ? 'Got it 🎉' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
