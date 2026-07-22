// Adaptation Engine (LIS Layer 9) — "learn the student, then change tomorrow."
//
// Capacity (Layer 3) sizes the number of HOURS the plan may use. Adaptation
// sizes how much WORK we ask for inside those hours — the pace assumption. Our
// Learning Engine prices a foundation QA question at ~10 min; a particular
// student may honestly need 15. If we never learn that, every day quietly
// overshoots and they feel behind at hours that were correct (the Pranav
// complaint was never "too many hours" — it was "too many questions").
//
// Two signals feed it, both already logged, no model anywhere:
//   1. plan_fit — the explicit Review-Engine tap ("too much / right / too
//      little"). High signal, but optional, so it accrues slowly.
//   2. completion ratio — tasks finished ÷ tasks planned over recent days.
//      Always present, so the engine can start learning from day one.
//
// The governing rule is asymmetric and motivation-first: **behaviour alone can
// only make the day lighter.** Chronic under-completion trims volume even with
// no complaint; but the ONLY route to a heavier plan is the student explicitly
// saying "too little." Over-loading kills consistency faster than under-loading,
// so we bias toward completable.
//
// Output is a single `volumeFactor` that multiplies task volume in the routine
// engine — never the time budget (that is Capacity's job) and never below the
// motivation cap (that is the Learning Engine's floor). Deterministic and
// explainable, exactly like the Capacity Engine it sits beside.

export interface Adaptation {
  planFitCount: number;             // plan_fit reports in the window
  tooMuchRatio: number;             // share of those that were 'too_much'
  tooLittleRatio: number;           // share that were 'too_little'
  completionRatio: number | null;   // tasks done ÷ planned over recent plan-days
  planDays: number;                 // days that had a plan (for the ratio)
  volumeFactor: number;             // multiplies task volume; 1.0 = unchanged
  trust: 'default' | 'learning';    // whether we've adapted off real behaviour
  note: string;                     // human explanation (admin + future student copy)
}

// Same recent window as the Capacity Engine, so the two engines reason over the
// same slice of the student's life.
export const ADAPTATION_WINDOW_DAYS = 21;
const MIN_FIT_SIGNALS = 3;   // enough plan-fit taps to act on the explicit signal
const MIN_PLAN_DAYS = 5;     // enough plan-days to trust the completion ratio
const MIN_FACTOR = 0.6;      // never trim a day below 60% of its priced volume
const MAX_FACTOR = 1.3;      // never inflate beyond 130% (still capped by unitCap)

const clamp = (lo: number, hi: number, x: number) => Math.max(lo, Math.min(hi, x));
// Round to the nearest 0.05 — factors stay clean and explainable ("×0.85").
const round05 = (n: number) => Math.round(n * 20) / 20;

const VALID = new Set(['too_much', 'right', 'too_little']);

// Pure and testable. `planFits` = the plan_fit values logged in the window
// (nulls already filtered out is fine — invalid values are ignored anyway).
// `completedTasks` / `plannedTasks` are summed over `planDays` recent days that
// actually had a routine (today excluded — it's still in progress).
export function computeAdaptation(
  planFits: string[],
  completedTasks: number,
  plannedTasks: number,
  planDays: number
): Adaptation {
  const fits = planFits.filter((f) => VALID.has(f));
  const tooMuch = fits.filter((f) => f === 'too_much').length;
  const tooLittle = fits.filter((f) => f === 'too_little').length;
  const tooMuchRatio = fits.length ? tooMuch / fits.length : 0;
  const tooLittleRatio = fits.length ? tooLittle / fits.length : 0;
  const completionRatio = planDays > 0 && plannedTasks > 0 ? completedTasks / plannedTasks : null;

  // Explicit plan-fit factor. Asymmetric: a day that felt "too much" pulls down
  // harder (×0.4) than a "too little" day pushes up (×0.3).
  let fitFactor = 1.0;
  if (fits.length >= MIN_FIT_SIGNALS) {
    const net = tooLittleRatio - tooMuchRatio; // -1 (all heavy) .. +1 (all light)
    fitFactor = net < 0 ? 1 + net * 0.4 : 1 + net * 0.3;
  }

  // Behavioural completion factor — can ONLY lighten. Chronic under-completion
  // (< 60% of the plan finished) trims volume even with no explicit complaint.
  let completionFactor = 1.0;
  if (completionRatio != null && planDays >= MIN_PLAN_DAYS && completionRatio < 0.6) {
    completionFactor = clamp(0.7, 1.0, 0.4 + completionRatio);
  }

  // Motivation-first combine: a bigger plan requires the student to explicitly
  // ask for it; behaviour on its own can only make the day lighter.
  const raw = fitFactor > 1.0 ? fitFactor : Math.min(fitFactor, completionFactor);
  const volumeFactor = clamp(MIN_FACTOR, MAX_FACTOR, round05(raw));

  const haveSignal = fits.length >= MIN_FIT_SIGNALS || (completionRatio != null && planDays >= MIN_PLAN_DAYS);
  const trust: Adaptation['trust'] = haveSignal && volumeFactor !== 1.0 ? 'learning' : 'default';

  const pct = Math.round(volumeFactor * 100);
  let note: string;
  if (trust === 'default') {
    note = fits.length || planDays
      ? 'Volume feels about right — no change to today.'
      : 'Not enough logged days yet — learning this student’s real pace.';
  } else if (volumeFactor < 1) {
    const why = fits.length >= MIN_FIT_SIGNALS && tooMuchRatio > 0
      ? `${tooMuch}/${fits.length} recent days logged "too much"`
      : completionRatio != null
        ? `only ~${Math.round(completionRatio * 100)}% of the plan finished lately`
        : 'recent days ran heavy';
    note = `Learned to trim: ${why} — today’s volume set to ${pct}% so it’s finishable, same hours.`;
  } else {
    note = `Learned to add: ${tooLittle}/${fits.length} recent days logged "too little" — today’s volume raised to ${pct}%.`;
  }

  return { planFitCount: fits.length, tooMuchRatio, tooLittleRatio, completionRatio, planDays, volumeFactor, trust, note };
}
