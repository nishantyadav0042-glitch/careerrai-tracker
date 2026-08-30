'use client';

import { useEffect } from 'react';
import { track } from '@/lib/journey';
import {
  readAndRefreshMarkers, browserStores, stashPending, takePending,
  decideProbeAction, PENDING_KEY, type PendingStore,
} from '@/lib/session-forensics';
import { ensurePersistentStorage, browserStorageManager } from '@/lib/storage-persistence';

// Reports which of two independent stores survived since the last app open.
// See lib/session-forensics for what each combination means and why the pair
// is what makes the answer decisive.
//
// Mounted on /login as well as the signed-in screens, because the moment worth
// measuring is the one where the student has just been forgotten — and on
// /login there is no user id yet, so `signedIn` decides whether this run is
// taking that reading or carrying it forward to a name. See the carry note in
// lib/session-forensics.

const READ_KEY = 'cr_fx_read';

/** sessionStorage: survives login's full page load, dies with the tab — which
 *  is exactly the scope of "one browsing session". A module-level flag was
 *  used before and reset on every page load, so the signed-in screen took a
 *  second reading of the markers /login had just re-armed. */
function browserPendingStore(): PendingStore {
  return {
    read: () => { try { return sessionStorage.getItem(PENDING_KEY); } catch { return null; } },
    write: (v) => { try { sessionStorage.setItem(PENDING_KEY, v); } catch { /* blocked */ } },
    clear: () => { try { sessionStorage.removeItem(PENDING_KEY); } catch { /* blocked */ } },
  };
}
const hasRead = () => { try { return sessionStorage.getItem(READ_KEY) === '1'; } catch { return false; } };
const markRead = () => { try { sessionStorage.setItem(READ_KEY, '1'); } catch { /* blocked */ } };

export function SessionForensicsProbe({ signedIn = false }: { signedIn?: boolean }) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pendingStore = browserPendingStore();
        const action = decideProbeAction({
          signedIn,
          alreadyReadThisSession: hasRead(),
          pending: signedIn ? takePending(pendingStore) : null,
        });
        if (action.kind === 'skip') return;

        if (action.kind === 'emit_carried') {
          if (cancelled) return;
          // Verbatim, with the flag that says so. A carried reading describes
          // the LOGIN page, not this one, and anything reading it as a fresh
          // observation of the signed-in screen would be wrong by ~2 seconds
          // and one navigation.
          track('session_forensics', { ...action.reading, carriedFromLogin: true });
          return;
        }

        // Read first: ensurePersistentStorage may itself change what the
        // browser is willing to keep, and the reading must describe the state
        // we ARRIVED in, not the one we just created.
        const markers = readAndRefreshMarkers(browserStores());
        const storage = await ensurePersistentStorage(browserStorageManager());
        if (cancelled) return;
        markRead();

        // Stash BEFORE emitting. If the beacon is lost to the login
        // navigation, the carried copy still reaches us attributed; losing
        // both would put us back to reading nothing on the one visit we care
        // about.
        if (!signedIn) stashPending(pendingStore, markers);

        track('session_forensics', {
          verdict: markers.verdict,
          cookieMarker: markers.cookieMarker,
          localMarker: markers.localMarker,
          markerAgeH: markers.markerAgeH,
          sbCookieVisible: markers.sbCookieVisible,
          sbCookieCount: markers.sbCookieCount,
          carriedFromLogin: false,
          // Storage pressure is the mechanism eviction would work through, so
          // the numbers that would drive it travel with the verdict.
          persistedBefore: storage.persistedBefore,
          persistedNow: storage.persistedNow,
          quotaMb: storage.quotaMb,
          usageMb: storage.usageMb,
        });
      } catch {
        /* a diagnostic must never reach the student */
      }
    })();

    return () => { cancelled = true; };
  }, [signedIn]);

  return null;
}
