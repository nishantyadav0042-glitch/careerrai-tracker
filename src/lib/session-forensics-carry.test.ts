import { describe, it, expect } from 'vitest';
import {
  decideProbeAction, stashPending, takePending, type PendingStore, type ForensicsReading,
} from './session-forensics';
import { readFileSync } from 'node:fs';

const reading = (over: Partial<ForensicsReading> = {}): ForensicsReading => ({
  verdict: 'no_marker', cookieMarker: false, localMarker: false,
  sbCookieVisible: false, sbCookieCount: 0, ...over,
});

function memStore(initial: string | null = null): PendingStore {
  let v = initial;
  return { read: () => v, write: (x) => { v = x; }, clear: () => { v = null; } };
}

describe('decideProbeAction — the login reading must reach a name', () => {
  it('carries the /login reading on the first signed-in mount', () => {
    // The whole point. The fresh reading available here is worthless: this
    // probe re-armed the markers on /login seconds ago and would read its own
    // handwriting as all_intact/age=0, which is what happened for two days.
    const carried = reading({ verdict: 'no_marker' });
    expect(decideProbeAction({ signedIn: true, alreadyReadThisSession: true, pending: carried }))
      .toEqual({ kind: 'emit_carried', reading: carried });
  });

  it('prefers the carried reading even over a fresh one it could take', () => {
    const carried = reading();
    expect(decideProbeAction({ signedIn: true, alreadyReadThisSession: false, pending: carried }).kind)
      .toBe('emit_carried');
  });

  it('reads fresh on /login — that is where the evidence is taken', () => {
    expect(decideProbeAction({ signedIn: false, alreadyReadThisSession: false, pending: null }))
      .toEqual({ kind: 'emit_fresh' });
  });

  it('reads fresh on an ordinary signed-in visit with nothing carried', () => {
    // The age=11 / age=12 case: a normal return, no /login hop, genuine reading.
    expect(decideProbeAction({ signedIn: true, alreadyReadThisSession: false, pending: null }))
      .toEqual({ kind: 'emit_fresh' });
  });

  it('SKIPS a second fresh read in the same browsing session', () => {
    // The artefact this fixes: a module-level guard reset on every page load,
    // so the signed-in screen re-measured markers /login had just written.
    expect(decideProbeAction({ signedIn: true, alreadyReadThisSession: true, pending: null }))
      .toEqual({ kind: 'skip' });
    expect(decideProbeAction({ signedIn: false, alreadyReadThisSession: true, pending: null }))
      .toEqual({ kind: 'skip' });
  });
});

describe('the carried reading is single-use and shape-checked', () => {
  it('round-trips a reading', () => {
    const s = memStore();
    stashPending(s, reading({ verdict: 'cookies_lost_storage_kept', localMarker: true, markerAgeH: 9 }));
    const got = takePending(s)!;
    expect(got.verdict).toBe('cookies_lost_storage_kept');
    expect(got.markerAgeH).toBe(9);
  });

  it('is consumed, so a stale reading is never reported twice', () => {
    // A second report would look like fresh evidence from a later navigation
    // and would silently double-count the one visit we care about.
    const s = memStore();
    stashPending(s, reading());
    expect(takePending(s)).not.toBeNull();
    expect(takePending(s)).toBeNull();
  });

  it('returns null for junk rather than inventing a verdict', () => {
    // sessionStorage is writable by anything on this origin.
    for (const junk of ['', 'not json', '{}', '{"verdict":123}', 'null', '[]']) {
      expect(takePending(memStore(junk))).toBeNull();
    }
  });

  it('survives a store that throws on every operation', () => {
    const boom: PendingStore = {
      read() { throw new Error('blocked'); },
      write() { throw new Error('blocked'); },
      clear() { throw new Error('blocked'); },
    };
    expect(takePending(boom)).toBeNull();
    expect(() => stashPending(boom, reading())).not.toThrow();
  });
});

describe('the two mounts are wired for their different jobs', () => {
  // The entire carry depends on one prop. Without `signedIn` on the student
  // layout the probe takes a fresh reading there instead of carrying the
  // login one — which is exactly the behaviour that produced two days of
  // all_intact/age=0 artefacts and hid a `no_marker` verdict.
  it('/login mounts the probe UNSIGNED so it takes and stashes the reading', () => {
    const src = readFileSync('src/app/login/page.tsx', 'utf8');
    expect(src).toContain('<SessionForensicsProbe />');
    expect(src).not.toContain('<SessionForensicsProbe signedIn');
  });

  it('the student layout mounts it SIGNED so it carries that reading to a name', () => {
    const src = readFileSync('src/app/student/layout.tsx', 'utf8');
    expect(src).toContain('<SessionForensicsProbe signedIn');
  });
});
