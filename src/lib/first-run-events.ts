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
// The first-log guide (24 Sep). TOUR_KEY records "has had a tour" and three
// other surfaces wait on it (the first-log prompt, the insight cloud, the
// notification ask), so it keeps its meaning. This second key lets the tour
// run ONE more time for a student who saw the old tour and has still never
// logged: on 24 Sep, 72 installed students had opened the app in 14 days,
// passed every onboarding gate, and never logged once.
export const FIRST_LOG_GUIDE_KEY = 'cr_first_log_guide_v1';

type FirstRunWindow = Window & {
  __crInsightVisible?: boolean;
  __crNotifAskVisible?: boolean;
  __crLogModalOpen?: boolean;
  __crTimetableAskVisible?: boolean;
  __crTourVisible?: boolean;
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

// The tour ON SCREEN, as opposed to tourDone() (it has run at least once).
// Needed since 24 Sep: the tour can run a second time for a never-logged
// student whose TOUR_KEY is already set, so tourDone() alone would let the
// buddy nudge and the coverage review open on top of it.
export function tourVisible(): boolean {
  try { return (window as FirstRunWindow).__crTourVisible === true; } catch { return false; }
}
export function setTourVisible(visible: boolean): void {
  try { (window as FirstRunWindow).__crTourVisible = visible; } catch { /* ignore */ }
}
export function tourDone(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return false; }
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
