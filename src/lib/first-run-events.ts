// First-run sequencing signals (founder order, 21 July):
//   1. notification permission  →  2. app tour  →  3. buddy pitch
// (plus the first-log auto-open, which also waits its turn).
//
// These are window-level events + flags because the participants are sibling
// client components (layout overlay, page tour, page modal) with no shared
// React state. Constants live here — NOT in the components — so the
// components can listen to each other without circular imports.

export const NOTIF_ASK_SETTLED_EVENT = 'cr-notif-ask-settled';
export const TOUR_DONE_EVENT = 'cr-app-tour-done';

export const TOUR_KEY = 'cr_app_tour_v1';

type FirstRunWindow = Window & {
  __crNotifAskVisible?: boolean;
  __crLogModalOpen?: boolean;
};

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
