// ── AN INSTALLED PWA'S STORAGE IS EVICTABLE UNLESS YOU ASK ──────────────────
//
// 29 Aug 2026. CareerRai's only repeat "I keep getting logged out" report came
// from a paying student on an INSTALLED Android PWA. Every forensic pointed the
// same way and every one of them ruled something out rather than in:
//
//   · the server almost never deletes the session (1 removal in 24h)
//   · GoTrue almost never refuses a refresh (1 in 24h; 0 already-used)
//   · 582 refreshes a day succeed for everybody else
//   · the auth cookie is nowhere near the chunking threshold
//   · the service worker does not intercept navigations, so no stale HTML
//
// What the instrumentation DID see, every time, is a protected request
// arriving with an empty jar: `sbNames: []` AND `hasRoleCookie: false`. Not
// the auth cookie alone — the httpOnly role cookie too, which no script can
// touch and which our server never clears. Cookies from one origin do not
// selectively vanish; the whole origin's data went at once.
//
// By default a browser treats a site's storage as "best-effort", and Chrome
// may evict ALL of it — cookies, localStorage, IndexedDB, Cache Storage —
// when the device is short of space. An installed app is exactly the case
// where that is most surprising to the person: they never cleared anything,
// they just opened the app and it had forgotten them.
//
// `navigator.storage.persist()` asks for the "persistent" bucket instead,
// which is not evicted under pressure. For an installed PWA Chrome normally
// grants it without a prompt. This is the standard hardening step for any
// app that stores a session, and CareerRai has never made the request.
//
// HONEST ABOUT WHAT THIS IS: eviction is the only hypothesis left standing,
// and it is not yet proven. So this both ASKS for persistence and REPORTS
// what it found — `persistedBefore` is the measurement. If reports keep
// arriving from browsers that were already persisted, eviction is refuted and
// the search continues, which is worth more than a fix nobody can check.

export interface StorageManagerLike {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
  estimate?(): Promise<{ quota?: number; usage?: number }>;
}

export interface StoragePersistence {
  /** Does this browser expose the Storage API at all? */
  supported: boolean;
  /** Was storage ALREADY persistent before we asked? The measurement. */
  persistedBefore: boolean;
  /** Did we have to ask? (false when it was already persistent) */
  requested: boolean;
  /** The state we ended in — what actually protects the session. */
  persistedNow: boolean;
  quotaMb?: number;
  usageMb?: number;
}

const mb = (bytes?: number): number | undefined =>
  typeof bytes === 'number' && Number.isFinite(bytes) ? Math.round(bytes / 1_048_576) : undefined;

/**
 * Ask for persistent storage, and report what the answer was.
 *
 * Never throws and never rejects: this runs on a student's first paint, and a
 * telemetry helper must not be able to break the app. Every failure degrades
 * to `supported: false`, which reads as UNKNOWN rather than as "fine".
 */
export async function ensurePersistentStorage(
  storage?: StorageManagerLike | null,
): Promise<StoragePersistence> {
  const unsupported: StoragePersistence = {
    supported: false, persistedBefore: false, requested: false, persistedNow: false,
  };
  if (!storage || typeof storage.persisted !== 'function' || typeof storage.persist !== 'function') {
    return unsupported;
  }

  try {
    const persistedBefore = await storage.persisted();

    // Only ask when we have to. persist() is idempotent, but a needless call
    // can surface a permission prompt in some browsers, and a student in the
    // middle of studying should never be asked anything by telemetry.
    const persistedNow = persistedBefore ? true : await storage.persist();

    let quotaMb: number | undefined;
    let usageMb: number | undefined;
    if (typeof storage.estimate === 'function') {
      try {
        const est = await storage.estimate();
        quotaMb = mb(est?.quota);
        usageMb = mb(est?.usage);
      } catch { /* estimate is a nicety; its absence must not lose the verdict */ }
    }

    return {
      supported: true,
      persistedBefore,
      requested: !persistedBefore,
      persistedNow: persistedNow === true,
      quotaMb,
      usageMb,
    };
  } catch {
    return unsupported;
  }
}

/** The live browser's StorageManager, or null anywhere it does not exist. */
export function browserStorageManager(): StorageManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  const sm = (navigator as Navigator & { storage?: StorageManagerLike }).storage;
  return sm && typeof sm.persisted === 'function' ? sm : null;
}
