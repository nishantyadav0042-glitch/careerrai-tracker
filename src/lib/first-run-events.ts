// First-run sequencing signals (founder order, 21 July):
//   0. Day-1 insight (VALUE first — "here's your weakness as of today")
//   1. notification permission → 2. app tour → 3. buddy pitch
// (plus the first-log auto-open, which also waits its turn).
//
// These are window-level events + flags because the participants are sibling
// client components (layout overlay, page tour, page modal) with no shared
// React state. Constants live here — NOT in the components — so the
// components can listen to each other without circular imports.

export const INSIGHT_DONE_EVENT = 'cr-first-insight-done';
export const NOTIF_ASK_SETTLED_EVENT = 'cr-notif-ask-settled';
export const TOUR_DONE_EVENT = 'cr-app-tour-done';
// Stage A (founder, 8 Aug): for a coaching student's first 2 days, the
// timetable ask outranks the tour — the photo-to-plan moment is the wow the
// first hour is for, and a tour of screens means little before the plan is
// theirs. The tour waits for this to settle, exactly as it waits for the
// notification ask.
export const TIMETABLE_ASK_SETTLED_EVENT = 'cr-timetable-ask-settled';

export const TOUR_KEY = 'cr_app_tour_v1';

type FirstRunWindow = Window & {
  __crInsightVisible?: boolean;
  __crNotifAskVisible?: boolean;
  __crLogModalOpen?: boolean;
  __crTimetableAskVisible?: boolean;
};

export function insightVisible(): boolean {
  try { return (window as FirstRunWindow).__crInsightVisible === true; } catch { return false; }
}

export function setInsightVisible(visible: boolean): void {
  try {
    (window as FirstRunWindow).__crInsightVisible = visible;
    if (!visible) window.dispatchEvent(new Event(INSIGHT_DONE_EVENT));
  } catch { /* ignore */ }
}

export function notifAskVisible(): boolean {
  try { return (window as FirstRunWindow).__crNotifAskVisible === true; } catch { return false; }
}

export function setNotifAskVisible(visible: boolean): void {
  try {
    (window as FirstRunWindow).__crNotifAskVisible = visible;
    if (!visible) window.dispatchEvent(new Event(NOTIF_ASK_SETTLED_EVENT));
  } catch { /* ignore */ }
}

export function logModalOpen(): boolean {
  try { return (window as FirstRunWindow).__crLogModalOpen === true; } catch { return false; }
}

export function setLogModalOpen(open: boolean): void {
  try { (window as FirstRunWindow).__crLogModalOpen = open; } catch { /* ignore */ }
}

export function tourDone(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return false; }
}

/**
 * Does an app tour even run here? `app-tour` starts ONLY in the installed app —
 * a browser tab still shows the address bar and the install prompts, so the
 * tour there lands on the wrong screen.
 *
 * This matters far outside the tour. Anything that waited for `tourDone()` was
 * waiting for an event that can never happen in a browser: on 5 Sep the
 * first-log nudge was found gated this way, and in 21 days 451 students who
 * opened CareerRai in a browser saw it ZERO times, of whom exactly one ever
 * logged. A sequencing gate outside the sequence it sequences is a locked door.
 */
export function tourApplies(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
  } catch { return false; }
}

/**
 * "The tour is no longer in the way" — true once it has been completed, and
 * true immediately where no tour will ever run. Wait on THIS, never on
 * tourDone(), unless the thing you are sequencing is itself installed-only.
 */
export function tourSettled(): boolean {
  return tourDone() || !tourApplies();
}

export function timetableAskVisible(): boolean {
  try { return (window as FirstRunWindow).__crTimetableAskVisible === true; } catch { return false; }
}

export function setTimetableAskVisible(visible: boolean): void {
  try {
    (window as FirstRunWindow).__crTimetableAskVisible = visible;
    if (!visible) window.dispatchEvent(new Event(TIMETABLE_ASK_SETTLED_EVENT));
  } catch { /* ignore */ }
}
