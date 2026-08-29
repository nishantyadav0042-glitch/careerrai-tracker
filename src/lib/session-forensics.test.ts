import { describe, it, expect } from 'vitest';
import { readAndRefreshMarkers, MARKER_KEY, type MarkerStores } from './session-forensics';

// The whole value of this tracker is one row of its truth table: cookies gone
// while localStorage survived. Chrome evicts an origin's data as a unit, so
// that combination would REFUTE the storage-eviction theory the app just
// shipped a fix for. A test suite that could not tell that row apart would let
// us keep believing a dead theory.

const stores = (init: { cookie?: string | null; local?: string | null; visible?: string[] }) => {
  const state = {
    cookie: init.cookie ?? null,
    local: init.local ?? null,
    visible: init.visible ?? [],
    wroteCookie: null as string | null,
    wroteLocal: null as string | null,
  };
  const s: MarkerStores = {
    readCookie: () => state.cookie,
    writeCookie: (_n, v) => { state.wroteCookie = v; },
    readLocal: () => state.local,
    writeLocal: (_k, v) => { state.wroteLocal = v; },
    visibleCookieNames: () => state.visible,
  };
  return { s, state };
};

const HOUR = 3_600_000;
const NOW = 1_700_000_000_000;

describe('the truth table this tracker exists for', () => {
  it('both markers gone: the whole origin was evicted (or a first visit)', () => {
    const { s } = stores({});
    expect(readAndRefreshMarkers(s, NOW).verdict).toBe('no_marker');
  });

  it('both markers survived: storage is not the story', () => {
    const { s } = stores({ cookie: String(NOW - HOUR), local: String(NOW - HOUR) });
    expect(readAndRefreshMarkers(s, NOW).verdict).toBe('all_intact');
  });

  it('THE DECIDING ROW — cookies gone, localStorage kept, refutes eviction', () => {
    const { s } = stores({ cookie: null, local: String(NOW - 5 * HOUR) });
    const r = readAndRefreshMarkers(s, NOW);
    expect(r.verdict).toBe('cookies_lost_storage_kept');
    expect(r.cookieMarker).toBe(false);
    expect(r.localMarker).toBe(true);
  });

  it('the inverse row is reported as itself, never folded into the others', () => {
    const { s } = stores({ cookie: String(NOW - 2 * HOUR), local: null });
    expect(readAndRefreshMarkers(s, NOW).verdict).toBe('storage_lost_cookies_kept');
  });
});

describe('the age it reports is the age of the device mark', () => {
  it('carries the OLDEST surviving timestamp forward, not "now"', () => {
    // Re-stamping with now() on every open would reset the clock and hide the
    // very interval we are trying to see.
    const old = NOW - 72 * HOUR;
    const { s, state } = stores({ cookie: String(old), local: String(old) });
    const r = readAndRefreshMarkers(s, NOW);
    expect(r.markerAgeH).toBe(72);
    expect(state.wroteCookie).toBe(String(old));
    expect(state.wroteLocal).toBe(String(old));
  });

  it('re-arms BOTH stores after a loss, so the next open is measurable', () => {
    const { s, state } = stores({ cookie: null, local: String(NOW - HOUR) });
    readAndRefreshMarkers(s, NOW);
    expect(state.wroteCookie).not.toBeNull();   // the wiped one is restored
    expect(state.wroteLocal).not.toBeNull();
  });

  it('a garbage marker value is treated as missing, never as an age', () => {
    for (const junk of ['', 'abc', '-1', '0', 'NaN']) {
      const { s } = stores({ cookie: junk, local: junk });
      const r = readAndRefreshMarkers(s, NOW);
      expect(r.verdict).toBe('no_marker');
      expect(r.markerAgeH).toBeUndefined();
    }
  });
});

describe('the Supabase cookie is observed, not assumed', () => {
  it('counts sb-* cookies visible to script', () => {
    const { s } = stores({ visible: ['cr_anon', 'sb-abc-auth-token', 'sb-abc-auth-token-code-verifier'] });
    const r = readAndRefreshMarkers(s, NOW);
    expect(r.sbCookieVisible).toBe(true);
    expect(r.sbCookieCount).toBe(2);
  });

  it('reports absence as absence — the finding, not a blank', () => {
    const { s } = stores({ visible: ['cr_anon', 'user_role'] });
    const r = readAndRefreshMarkers(s, NOW);
    expect(r.sbCookieVisible).toBe(false);
    expect(r.sbCookieCount).toBe(0);
  });
});

describe('a diagnostic must never break the app', () => {
  it('survives every store throwing', () => {
    const hostile: MarkerStores = {
      readCookie: () => { throw new Error('x'); },
      writeCookie: () => { throw new Error('x'); },
      readLocal: () => { throw new Error('x'); },
      writeLocal: () => { throw new Error('x'); },
      visibleCookieNames: () => { throw new Error('x'); },
    };
    expect(() => readAndRefreshMarkers(hostile, NOW)).not.toThrow();
    expect(readAndRefreshMarkers(hostile, NOW).verdict).toBe('no_marker');
  });

  it('stores no identifier — the marker is a timestamp and nothing else', () => {
    const { s, state } = stores({});
    readAndRefreshMarkers(s, NOW);
    expect(state.wroteCookie).toMatch(/^\d+$/);
    expect(state.wroteLocal).toMatch(/^\d+$/);
    expect(MARKER_KEY).toBe('cr_fx');
  });
});
