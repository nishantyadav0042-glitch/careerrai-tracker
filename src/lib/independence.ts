// ── 15 August, on the student's screen ──────────────────────────────────────
//
// Founder, 13 Aug: "add something on our homepage for independence
// perspective — a theme, the Indian flag or the colours."
//
// Two rules keep a seasonal theme from becoming clutter:
//
//  1. IT LEAVES ON ITS OWN. A banner that has to be taken down by hand is
//     still on the screen in September. The window is computed, so the theme
//     appears and disappears without anyone remembering to act.
//
//  2. IT NEVER CARRIES A CLAIM. The tricolour is decoration and a greeting.
//     The moment a seasonal banner starts quoting a statistic or a discount
//     that is not independently true, it becomes a thing we have to defend.
//
// The line ties the day to the product honestly — CareerRai's whole promise
// is that a student preparing alone should not be preparing blind. That is a
// real product claim on any day of the year; 15 August is just when it lands.

/** IST is where our students are; the day must turn at their midnight. */
const IST_OFFSET_MS = 5.5 * 3600_000;

/** 13–16 Aug inclusive: a couple of days of run-up, gone by the 17th. */
export const INDEPENDENCE_FROM = { month: 8, day: 13 };
export const INDEPENDENCE_TO = { month: 8, day: 16 };

export function isIndependenceWindow(now: Date = new Date()): boolean {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const month = ist.getUTCMonth() + 1;
  const day = ist.getUTCDate();
  if (month !== INDEPENDENCE_FROM.month) return false;
  return day >= INDEPENDENCE_FROM.day && day <= INDEPENDENCE_TO.day;
}

/** True only on the day itself — the greeting changes tense. */
export function isIndependenceDay(now: Date = new Date()): boolean {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return ist.getUTCMonth() + 1 === 8 && ist.getUTCDate() === 15;
}

export const INDEPENDENCE_HEADLINE = 'Happy Independence Day 🇮🇳';
export const INDEPENDENCE_RUNUP = 'Independence Day week 🇮🇳';

/**
 * The one line. It is a product truth, not a slogan: preparing on your own is
 * the norm for a CAT aspirant, and doing it without knowing where you stand
 * is the part CareerRai exists to end.
 */
export const INDEPENDENCE_LINE = 'Prepare on your own. Never blindly.';
