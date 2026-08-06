// Adaptation Engine (LIS Layer 9) — "learn the student, and SAY what you learnt."
//
// This engine used to end in a `volumeFactor` that silently multiplied the task
// count on today's plan by anything from 0.6 to 1.3. The intent was kind: a
// student who never finishes the day gets a smaller day. The effect was not.
//
// Founder, 6 Aug: "keep their hours fixed and remove volumeFactor... sometimes
// they are seeing 4 hrs of study, sometimes 6 hours... I don't want them to
// come on our app and feel confused daily. This will be the biggest blunder."
//
// He is right, and the reason is worth writing down so nobody adds it back. The
// factor made the plan a moving target measured against a fixed commitment. A
// student who set 5 hours and worked hard on Monday got a lighter Tuesday for
// their trouble; one who under-logged got trimmed toward under-logging, which
// is a slow slide nobody consented to. And because the trim was invisible, the
// only way to notice was to count the questions — which is exactly what one
// student did before asking why her 11-hour plan produced four hours of tasks.
//
// So the engine still watches. It still reads:
//   1. plan_fit — the explicit Review-Engine tap ("too much / right / too
//      little"). High signal, optional, so it accrues slowly.
//   2. completion ratio — tasks finished ÷ tasks planned over recent days.
//      Always present, so it can start learning from day one.
//
// It just doesn't act. What it produces is a READING — heavy, balanced, or
// light — that goes to the buddy dossier, the admin surfaces, and the coaching
// decision, where a human can do something about it. The student's day is sized
// by the student's own hours and nothing else.

export type LoadReading = 'heavy' | 'balanced' | 'light';

export interface Adaptation {
  planFitCount: number;             // plan_fit reports in the window
  tooMuchRatio: number;             // share of those that were 'too_much'
  tooLittleRatio: number;           // share that were 'too_little'
  completionRatio: number | null;   // tasks done ÷ planned over recent plan-days
  planDays: number;                 // days that had a plan (for the ratio)
  /** What the behaviour says about the load. An observation, never a lever. */
  reading: LoadReading;
  trust: 'default' | 'learning';    // whether there is enough behaviour to read
  note: string;                     // human explanation (buddy + admin surfaces)
}

// Same recent window as the Capacity Engine, so the two engines reason over the
// same slice of the student's life.
export const ADAPTATION_WINDOW_DAYS = 21;
const MIN_FIT_SIGNALS = 3;   // enough plan-fit taps to act on the explicit signal
const MIN_PLAN_DAYS = 5;     // enough plan-days to trust the completion ratio

/** Below this share of the plan finished, the day is genuinely running heavy. */
export const HEAVY_COMPLETION_RATIO = 0.6;

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

  const enoughFits = fits.length >= MIN_FIT_SIGNALS;
  const enoughDays = completionRatio != null && planDays >= MIN_PLAN_DAYS;
  const haveSignal = enoughFits || enoughDays;

  // Heavy wins ties. A day that is both under-finished and complained about is
  // heavy, and mistaking a struggling student for a bored one is the worse
  // error of the two.
  let reading: LoadReading = 'balanced';
  if ((enoughFits && tooMuchRatio > tooLittleRatio && tooMuchRatio >= 0.4)
      || (enoughDays && completionRatio! < HEAVY_COMPLETION_RATIO)) {
    reading = 'heavy';
  } else if (enoughFits && tooLittleRatio >= 0.5) {
    reading = 'light';
  }

  const trust: Adaptation['trust'] = haveSignal && reading !== 'balanced' ? 'learning' : 'default';

  let note: string;
  if (trust === 'default') {
    note = fits.length || planDays
      ? 'Load looks about right — the plan is being finished at roughly the rate it is set.'
      : 'Not enough logged days yet — still learning this student’s real pace.';
  } else if (reading === 'heavy') {
    const why = enoughFits && tooMuchRatio > 0
      ? `${tooMuch}/${fits.length} recent days logged "too much"`
      : `only ~${Math.round(completionRatio! * 100)}% of the plan is getting finished`;
    // Deliberately phrased as something a COACH acts on. The app will not quietly
    // shrink the day; if the load is genuinely wrong, the student changes their
    // hours, or their buddy talks to them about how they are working.
    note = `Running heavy: ${why}. Their hours are unchanged — worth asking whether the number is still right for them.`;
  } else {
    note = `Running light: ${tooLittle}/${fits.length} recent days logged "too little". They may be ready to raise their own daily hours.`;
  }

  return { planFitCount: fits.length, tooMuchRatio, tooLittleRatio, completionRatio, planDays, reading, trust, note };
}
