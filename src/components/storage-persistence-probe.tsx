'use client';

import { useEffect } from 'react';
import { track } from '@/lib/journey';
import { ensurePersistentStorage, browserStorageManager } from '@/lib/storage-persistence';

// Asks the browser to stop treating this app's storage as disposable, and
// records what the answer was. See lib/storage-persistence for why.
//
// Renders nothing and blocks nothing: it runs after paint, and every failure
// inside it is swallowed. A student must never wait on, or be interrupted by,
// a telemetry call.

/** One report per page life — this is a property of the browser, not a feed. */
let reported = false;

export function StoragePersistenceProbe() {
  useEffect(() => {
    if (reported) return;
    reported = true;

    let cancelled = false;
    void (async () => {
      try {
        const result = await ensurePersistentStorage(browserStorageManager());
        if (cancelled) return;
        // persistedBefore is the finding. If a repeat-logout report arrives
        // from a browser that was ALREADY persistent, eviction is refuted and
        // this measurement is what tells us so.
        track('storage_persistence', {
          supported: result.supported,
          persistedBefore: result.persistedBefore,
          requested: result.requested,
          persistedNow: result.persistedNow,
          quotaMb: result.quotaMb,
          usageMb: result.usageMb,
        });
      } catch {
        /* never let telemetry reach the student */
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return null;
}
