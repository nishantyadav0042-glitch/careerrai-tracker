import { studyDayString } from '@/lib/study-day';
// Ensures at most ONE auto-shown modal (install journey, buddy nudge, …) appears
// per calendar day, so students are never stacked or nagged. The first eligible
// caller of the day wins; everyone else stands down.
const KEY = 'cr_daily_modal';

// ── THE PRIORITY BETWEEN THE AUTO-MODALS IS THESE TWO NUMBERS ───────────────
//
// "First eligible caller of the day wins" is only a fair race if the order in
// which they call is decided on purpose. It was not, and Incident #92 is what
// that cost: the layout tried to express the priority as a server-side
// exclusion (`!showResourceAnnounce`), which was both a contradiction and
// unknowable server-side — the "already seen it" fact lives in localStorage.
//
// So the priority lives here, in the settle delays, where it is real and
// testable. The one-time concept-resource announcement claims FIRST on the
// single day it appears; once its own SEEN_KEY is set it returns before
// claiming at all, and the buddy nudge — which is there every day — takes the
// slot 400ms later. Both delays also serve their original purpose: letting the
// log modal and the first-run asks claim the screen before either of these
// lands on top of them.
//
// daily-modal-priority.guard.test.ts asserts the ordering. Change one of these
// and you are changing which modal a student sees; change both and you are
// changing nothing except how long they wait.
export const ANNOUNCE_SETTLE_MS = 1800;
export const NUDGE_SETTLE_MS = 2200;

export function claimDailyModal(): boolean {
  try {
    const today = studyDayString();
    if (localStorage.getItem(KEY) === today) return false;
    localStorage.setItem(KEY, today);
    return true;
  } catch {
    return true;
  }
}
