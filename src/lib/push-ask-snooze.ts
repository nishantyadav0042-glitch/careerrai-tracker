// ── "LATER" MEANS LATER, NOT "UNTIL THE NEXT RE-RENDER" ─────────────────────
//
// Day-1 → Day-2 mission, 22 Sep 2026. The notification ask's Later button hid
// the panel and remembered nothing, by design: the founder's rule (21 July) is
// that the ask returns on EVERY app open until notifications are on. The
// defect is in what counted as an open. Production, 18 Sep, one repeat student:
//
//   12:19:36  later
//   12:21:11  later   ← the reschedule Save reloaded the page
//   13:18:02  later   ← back after an hour: a genuine reopen
//   13:18:39  later   ← back from a resource link nine seconds later
//   15:59:44  switched on notifications
//
// 648 Later taps across 162 students (all cohorts) look like copy that does
// not land. Two of the four above were not opens at all; they were the product
// reloading itself and a nine-second excursion to YouTube.
//
// This keeps the founder's rule and fixes the definition of "open": a Later
// holds for the rest of this browsing session AND until the app has been away
// for REENTRY_GAP_MS (lib/session-boundary.ts) — the same boundary the journey
// tracker uses to write `app_resume`. A new session (the app was closed) or a
// real return re-asks exactly as before. A reload, a route change or a
// thirty-second excursion does not.
//
// Storage is sessionStorage: it dies with the app, which is what "the next
// app open" means for a browser tab, and for a resident PWA the re-entry clock
// covers the rest. Nothing here touches push delivery, permission, or what is
// asked — only when the same question is repeated.

export const PUSH_ASK_LATER_KEY = 'cr_push_ask_later_at';

/** The slice of Storage this needs. sessionStorage in the app; a Map in tests. */
export interface SnoozeStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function snoozeLater(store: SnoozeStore, now: number): void {
  try { store.setItem(PUSH_ASK_LATER_KEY, String(now)); } catch { /* storage may be unavailable */ }
}

export function laterSnoozed(store: SnoozeStore): boolean {
  try {
    const raw = store.getItem(PUSH_ASK_LATER_KEY);
    return raw != null && Number.isFinite(Number(raw));
  } catch {
    return false;
  }
}

/** A re-entry ends the snooze: the founder's "every app open" rule resumes. */
export function clearSnooze(store: SnoozeStore): void {
  try { store.removeItem(PUSH_ASK_LATER_KEY); } catch { /* ignore */ }
}
