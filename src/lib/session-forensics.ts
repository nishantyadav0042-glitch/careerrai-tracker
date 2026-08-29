// ── A TRACKER FOR ONE STUDENT, AND THE QUESTION IT SETTLES ──────────────────
//
// 29 Aug 2026. A paying student on an installed Android PWA re-authenticates
// every time he opens the app. Everything measurable from our side has been
// ruled out with evidence: the server almost never deletes a session (1 in
// 24h), GoTrue almost never refuses a refresh (1 in 24h, 0 already-used, 0
// expiries), 582 refreshes a day succeed for other people, his cookie is far
// below the chunking threshold, the service worker never serves cached HTML,
// and he is on a single origin. His own sessions were never refreshed and
// never rotated, which also rules out a token rotation whose replacement was
// discarded. His cookies simply stop being sent.
//
// The founder's objection is the sharp one: his other apps keep him logged in,
// so why this one? It cannot be answered from a server that only ever sees an
// empty cookie jar, and it cannot be answered by asking him about other
// websites — he uses the installed app, not a browser.
//
// So write the SAME marker into two stores that fail for DIFFERENT reasons,
// and report which of them survived:
//
//   cookie gone + localStorage gone      → the whole origin was evicted
//   cookie gone + localStorage survived  → cookies specifically were removed,
//                                          which eviction cannot do
//   both survived                        → storage is fine and the session
//                                          died some other way
//
// That middle row is the one that would kill the storage-eviction theory, and
// it is the reason this is worth deploying rather than another guess. Chrome
// evicts an origin's data as a unit; it does not take the cookies and leave
// localStorage behind.
//
// NOTHING IDENTIFYING IS STORED. The marker is a timestamp — no user id, no
// phone, no token. The event is joined to a person server-side by the same
// path every other journey event already uses.

export const MARKER_KEY = 'cr_fx';

export interface MarkerStores {
  readCookie(name: string): string | null;
  writeCookie(name: string, value: string, maxAgeSeconds: number): void;
  readLocal(key: string): string | null;
  writeLocal(key: string, value: string): void;
  /** Names of cookies JS can see. Supabase writes its auth cookie with
   *  httpOnly:false, so its absence here is real evidence rather than a
   *  limitation of the vantage point. */
  visibleCookieNames(): string[];
}

export type ForensicsVerdict =
  /** No marker in either store: a first visit, or everything was wiped. The
   *  join to a known account server-side is what tells those apart. */
  | 'no_marker'
  /** Both markers survived. Storage is not the story. */
  | 'all_intact'
  /** THE DECIDING ROW. Cookies gone, localStorage kept — eviction takes an
   *  origin whole, so this would refute it. */
  | 'cookies_lost_storage_kept'
  /** localStorage gone, cookies kept — the inverse, and equally informative. */
  | 'storage_lost_cookies_kept'
  /** Both gone though we had written them: the origin was evicted. */
  | 'everything_lost';

export interface ForensicsReading {
  verdict: ForensicsVerdict;
  cookieMarker: boolean;
  localMarker: boolean;
  /** Hours since the OLDEST surviving marker was written. */
  markerAgeH?: number;
  /** Is a Supabase auth cookie visible to script right now? */
  sbCookieVisible: boolean;
  sbCookieCount: number;
}

const HOUR = 3_600_000;
const YEAR_SECONDS = 60 * 60 * 24 * 365;

const parseTs = (v: string | null): number | null => {
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Read both markers, decide the verdict, then re-write both so the next open
 * has something to measure. Never throws: a student must never see a crash
 * from a diagnostic.
 */
export function readAndRefreshMarkers(s: MarkerStores, now = Date.now()): ForensicsReading {
  let cookieTs: number | null = null;
  let localTs: number | null = null;
  let visible: string[] = [];

  try { cookieTs = parseTs(s.readCookie(MARKER_KEY)); } catch { /* unreadable */ }
  try { localTs = parseTs(s.readLocal(MARKER_KEY)); } catch { /* unreadable */ }
  try { visible = s.visibleCookieNames(); } catch { /* unreadable */ }

  const cookieMarker = cookieTs !== null;
  const localMarker = localTs !== null;

  const verdict: ForensicsVerdict =
    !cookieMarker && !localMarker ? 'no_marker'
      : cookieMarker && localMarker ? 'all_intact'
        : localMarker ? 'cookies_lost_storage_kept'
          : 'storage_lost_cookies_kept';

  const oldest = [cookieTs, localTs].filter((t): t is number => t !== null).sort((a, b) => a - b)[0];
  const markerAgeH = oldest === undefined ? undefined : Math.round((now - oldest) / HOUR);

  // Re-arm. Written AFTER reading, and to both stores, so a store that was
  // wiped is measurable again next time rather than staying blind forever.
  // The oldest surviving timestamp is carried forward, so `markerAgeH`
  // measures how long this device has been marked rather than resetting to
  // zero on every open and hiding the very interval we are trying to see.
  const carry = String(oldest ?? now);
  try { s.writeCookie(MARKER_KEY, carry, YEAR_SECONDS); } catch { /* unwritable */ }
  try { s.writeLocal(MARKER_KEY, carry); } catch { /* unwritable */ }

  const sb = visible.filter((n) => n.startsWith('sb-'));
  return {
    verdict,
    cookieMarker,
    localMarker,
    markerAgeH,
    sbCookieVisible: sb.length > 0,
    sbCookieCount: sb.length,
  };
}

/** The live browser's stores. Null-safe everywhere it does not exist. */
export function browserStores(): MarkerStores {
  return {
    readCookie(name) {
      const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
      return m ? decodeURIComponent(m[1]) : null;
    },
    writeCookie(name, value, maxAgeSeconds) {
      const secure = location.protocol === 'https:' ? '; secure' : '';
      document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax${secure}`;
    },
    readLocal: (key) => window.localStorage.getItem(key),
    writeLocal: (key, value) => window.localStorage.setItem(key, value),
    visibleCookieNames: () =>
      document.cookie.split('; ').map((c) => c.split('=')[0]).filter(Boolean),
  };
}
