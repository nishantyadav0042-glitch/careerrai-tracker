import { studyDayString } from './study-day';

// First-run sequencing signals. The founder's order was set 21 July:
// notification permission → app tour → buddy pitch. The app tour and the
// first-log auto-open are gone (24 Sep); what waited for the tour now waits
// for the student's second study day (see firstDayOver).
//
// These are window-level events + flags because the participants are sibling
// client components (layout overlay, page tour, page modal) with no shared
// React state. Constants live here — NOT in the components — so the
// components can listen to each other without circular imports.

export const INSIGHT_DONE_EVENT = 'cr-first-insight-done';
export const NOTIF_ASK_SETTLED_EVENT = 'cr-notif-ask-settled';
// Stage A (founder, 8 Aug): for a coaching student's first 2 days, the
// timetable ask outranks everything optional — the photo-to-plan moment is the
// wow the first hour is for.
export const TIMETABLE_ASK_SETTLED_EVENT = 'cr-timetable-ask-settled';

// Set on devices that finished the old app tour (retired 24 Sep). Read only,
// so a student who already had their first day is never given a second one.
export const TOUR_KEY = 'cr_app_tour_v1';
// The study day this device first opened Home on, once the tour was gone.
export const FIRST_HOME_DAY_KEY = 'cr_first_home_day_v1';

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

/**
 * Is the student past their first day in the app? Day one is the plan and
 * nothing else (founder, 24 Sep: "the first task is the onboarding"), so the
 * buddy pitch, the yesterday check-in, the weekly review and the insight cloud
 * all wait for this. They used to wait for the app tour.
 *
 * The first call on a device records today's study day (05:30 IST rollover)
 * and answers no; from the next study day on it answers yes. A device that
 * finished the old tour already had its first day.
 */
export function firstDayOver(now: Date = new Date()): boolean {
  try {
    if (localStorage.getItem(TOUR_KEY) === '1') return true;
    const today = studyDayString(now);
    const first = localStorage.getItem(FIRST_HOME_DAY_KEY);
    if (!first) {
      localStorage.setItem(FIRST_HOME_DAY_KEY, today);
      return false;
    }
    return first !== today;
  } catch {
    return false;
  }
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
