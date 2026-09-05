import { studyDayString } from '@/lib/study-day';

// ── The first-log nudge, and the two ways it was silently spending itself ────
//
// The nudge auto-opens the logging modal once for a student who has never
// logged. It is the single highest-leverage moment in the product: students who
// see it log at 42%, students who never see it log at 8%.
//
// Two defects, both found on 5 Sep by walking the funnel:
//
// 1. It was gated on the app TOUR having been completed — and the tour only
//    runs in the installed app. In 21 days, 451 students opened CareerRai in a
//    browser, ZERO saw the nudge, and ONE of them ever logged. The gate existed
//    to stop overlays stacking during the installed first-run sequence; outside
//    that sequence it was not a queue, it was a locked door. (Fixed at the call
//    site via tourSettled(), which waits for the tour only where a tour runs.)
//
// 2. It wrote its "already shown" flag when the modal OPENED. 242 of 335
//    dismissals were this nudge, median 9 seconds open, and 85.5% of them never
//    touched a single control. A modal closed by reflex in four seconds had
//    spent the student's only chance on that device, permanently — 226 students
//    were sitting in exactly that state.
//
// This module is the second fix, kept pure so the decision is testable without
// a browser: a sighting only counts against the student when they actually
// engaged with it, and an untouched dismissal buys another day.

export const FIRST_LOG_NUDGE_KEY = 'cr_first_log_nudge_v2';
/** The pre-fix boolean. Its presence means "shown once, under the old rules". */
export const LEGACY_KEY = 'cr_first_log_prompt_v1';

/**
 * Enough to be seen on a day the student is actually paying attention, few
 * enough that it never becomes nagging. Three sightings on three separate days
 * is the whole budget, and engaging once ends it early.
 */
export const MAX_SIGHTINGS = 3;

export interface NudgeState {
  /** How many times it has been shown. */
  shown: number;
  /** Study-day of the last sighting — at most one per day. */
  lastDay: string | null;
  /** The student engaged with it. Done asking; they know it is there. */
  spent: boolean;
}

export const FRESH: NudgeState = { shown: 0, lastDay: null, spent: false };

export function shouldShow(state: NudgeState, today: string): boolean {
  if (state.spent) return false;
  if (state.shown >= MAX_SIGHTINGS) return false;
  // Once per day. Re-opening it twice in one session is nagging, not a nudge.
  return state.lastDay !== today;
}

export function afterShown(state: NudgeState, today: string): NudgeState {
  return { ...state, shown: state.shown + 1, lastDay: today };
}

/**
 * What a dismissal costs. Touching any control means the student read it and
 * made a choice — that is a real sighting and we stop. Closing it untouched is
 * a reflex, and reflexes must not consume the only chance the product gets.
 */
export function afterDismiss(state: NudgeState, touchedAnything: boolean): NudgeState {
  return touchedAnything ? { ...state, spent: true } : state;
}

/** Logging is the point. Once they have, the nudge is over for good. */
export function afterLogged(state: NudgeState): NudgeState {
  return { ...state, spent: true };
}

// ── Storage. Deliberately fails OPEN ────────────────────────────────────────
//
// The old code did `try { ... } catch { return; }` — so a browser that throws
// on localStorage (private mode, blocked site data) got NO nudge at all. That
// is the wrong way round: the fallback for "I cannot remember whether I showed
// this" is to show it, not to withhold the one thing that makes a student log.

export function readState(now: Date = new Date()): NudgeState {
  void now;
  try {
    const raw = localStorage.getItem(FIRST_LOG_NUDGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<NudgeState>;
      return {
        shown: typeof p.shown === 'number' ? p.shown : 0,
        lastDay: typeof p.lastDay === 'string' ? p.lastDay : null,
        spent: p.spent === true,
      };
    }
    // Migration: a student carrying the old boolean was shown it once, under
    // rules that let a reflex dismissal end it. They get the remaining budget
    // rather than a clean slate — they have seen it, just not fairly.
    if (localStorage.getItem(LEGACY_KEY)) return { shown: 1, lastDay: null, spent: false };
    return FRESH;
  } catch {
    return FRESH;
  }
}

export function writeState(state: NudgeState): void {
  try { localStorage.setItem(FIRST_LOG_NUDGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

/** Today's study-day key — the 3 AM IST boundary the rest of the app uses. */
export function nudgeToday(now: Date = new Date()): string {
  return studyDayString(now);
}
