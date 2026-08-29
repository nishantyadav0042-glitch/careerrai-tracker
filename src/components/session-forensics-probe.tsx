'use client';

import { useEffect } from 'react';
import { track } from '@/lib/journey';
import { readAndRefreshMarkers, browserStores } from '@/lib/session-forensics';
import { ensurePersistentStorage, browserStorageManager } from '@/lib/storage-persistence';

// Reports which of two independent stores survived since the last app open.
// See lib/session-forensics for what each combination means and why the pair
// is what makes the answer decisive.
//
// Mounted on the LOGGED-OUT screens as well as the signed-in ones, because the
// moment worth measuring is the one where the student has just been forgotten.

let reported = false;

export function SessionForensicsProbe() {
  useEffect(() => {
    if (reported) return;
    reported = true;

    let cancelled = false;
    void (async () => {
      try {
        // Read first: ensurePersistentStorage may itself change what the
        // browser is willing to keep, and the reading must describe the state
        // we ARRIVED in, not the one we just created.
        const markers = readAndRefreshMarkers(browserStores());
        const storage = await ensurePersistentStorage(browserStorageManager());
        if (cancelled) return;

        track('session_forensics', {
          verdict: markers.verdict,
          cookieMarker: markers.cookieMarker,
          localMarker: markers.localMarker,
          markerAgeH: markers.markerAgeH,
          sbCookieVisible: markers.sbCookieVisible,
          sbCookieCount: markers.sbCookieCount,
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
  }, []);

  return null;
}
