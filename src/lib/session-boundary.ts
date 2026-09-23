// ── SESSION BOUNDARIES: what "the student came back" means, in one place ────
//
// Day-1 → Day-2 mission, 22 Sep 2026. The forensic report could show WHAT a
// repeat student did but not HOW they arrived or WHEN a visit ended, because:
//
//   · `app_open` fires on every root-layout mount — every full page load,
//     including the reloads the product itself performs (reschedule Save,
//     push enable) and the login redirect. So an `app_open` was never "a
//     student opened the app"; it was "a document loaded".
//   · A resident PWA (Android or iOS) is REOPENED by a visibilitychange, not a
//     remount. Nothing was written for that. A student who left at 09:00 and
//     came back at 21:00 without the OS killing the app produced no open at
//     all, and the whole return was invisible.
//   · Nothing said how they came in. The notification click is attributed
//     (`notifications.app_opened_at`, via ?src_notif / postMessage), broadcast
//     links carry ?src=, and everything else — the home-screen icon, a typed
//     URL, a WhatsApp link — was the same row.
//
// Three small, pure decisions live here so the ask surfaces and the tracker
// agree about them, and so a test can pin them without a browser:
//
//   sessionIsNew   — did THIS page load mint the session id (a cold start),
//                    or is it a reload / in-session navigation?
//   isReentry      — was the app hidden long enough that coming back counts
//                    as a return rather than a glance at another app?
//   classifyLaunch — which door did they come through?
//
// EPISTEMIC NOTE. A launch route is a fact about the URL and the referrer at
// the moment of arrival. It is NOT intent, and a notification launch is NOT
// evidence that the notification caused the study that follows. Read it as
// "what preceded the re-entry", nothing more.

/**
 * The one number. A return after this long away is a re-entry; anything
 * shorter is an excursion (a resource opened in YouTube, a WhatsApp reply, a
 * lock screen). Thirty minutes is the same inactivity cap the forensic dwell
 * analysis used, so "session" means the same thing in the data and in the
 * product. Chosen, not measured — there is no visible-transition data yet to
 * measure it from, which is part of what this instrumentation creates.
 */
export const REENTRY_GAP_MS = 30 * 60_000;

export type LaunchRoute =
  | 'notification'   // ?src_notif=<id> on the URL, or the SW's NOTIFICATION_APP_OPEN message
  | 'channel'        // ?src=<channel> — a broadcast link (lib/channels.ts)
  | 'icon'           // an installed surface with no referrer: the home-screen icon
  | 'internal'       // same-origin referrer: a redirect or reload inside the app
  | 'whatsapp'       // referrer names WhatsApp
  | 'external'       // some other page linked here
  | 'direct'         // a browser tab with no referrer: typed, bookmarked, restored
  | 'unknown';

export interface LaunchSignals {
  /** window.location.search, verbatim. */
  search: string;
  /** document.referrer, verbatim ('' when absent). Never stored; only classified. */
  referrer: string;
  /** window.location.origin, so a same-origin referrer can be recognised. */
  origin: string;
  /** detectDisplayMode() at the time of the launch. */
  displayMode: 'standalone' | 'twa' | 'ios_app' | 'browser' | 'unknown';
  /** The SW already told this client it was focused for a notification. */
  notificationMessage?: boolean;
}

function hostOf(url: string): string | null {
  try { return new URL(url).host.toLowerCase(); } catch { return null; }
}

/**
 * Pure. Decides the door from the signals the browser gives us on arrival.
 * Order matters: an explicit attribution beats an inferred one, and an
 * installed surface with no referrer is the icon whatever else is true.
 */
export function classifyLaunch(s: LaunchSignals): LaunchRoute {
  let params: URLSearchParams;
  try { params = new URLSearchParams(s.search); } catch { params = new URLSearchParams(); }
  if (s.notificationMessage || params.get('src_notif')) return 'notification';
  if (params.get('src')) return 'channel';

  const installed = s.displayMode === 'standalone' || s.displayMode === 'twa' || s.displayMode === 'ios_app';
  const ref = s.referrer.trim();
  if (!ref) return installed ? 'icon' : s.displayMode === 'browser' ? 'direct' : 'unknown';

  const refHost = hostOf(ref);
  const selfHost = hostOf(s.origin);
  if (refHost && selfHost && refHost === selfHost) return 'internal';
  // Android sets an `android-app://<package>` referrer for a link opened from
  // ANY app (see displayModeFrom); WhatsApp's package is the one we can name.
  if (/whatsapp/i.test(ref)) return 'whatsapp';
  return 'external';
}

/** Pure. Was the app away long enough for the return to count as a re-entry? */
export function isReentry(hiddenMs: number | null | undefined): boolean {
  return typeof hiddenMs === 'number' && Number.isFinite(hiddenMs) && hiddenMs >= REENTRY_GAP_MS;
}

/**
 * A tiny hidden/visible clock so every consumer measures "how long away" the
 * same way. Pure over a `now` so it can be tested without timers.
 */
export interface AwayClock { hiddenAt: number | null }

export function noteHidden(clock: AwayClock, now: number): AwayClock {
  return { hiddenAt: now };
}

/**
 * On becoming visible: how long were we hidden (null if we never saw the
 * hide), and the clock reset for the next cycle.
 */
export function noteVisible(clock: AwayClock, now: number): { hiddenMs: number | null; clock: AwayClock } {
  const hiddenMs = clock.hiddenAt == null ? null : Math.max(0, now - clock.hiddenAt);
  return { hiddenMs, clock: { hiddenAt: null } };
}
