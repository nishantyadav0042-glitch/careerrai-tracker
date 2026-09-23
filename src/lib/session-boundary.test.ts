import { describe, it, expect } from 'vitest';
import {
  classifyLaunch, isReentry, noteHidden, noteVisible, REENTRY_GAP_MS,
} from './session-boundary';

const ORIGIN = 'https://careerrai.in';
const base = { search: '', referrer: '', origin: ORIGIN, displayMode: 'browser' as const };

describe('classifyLaunch — which door the student came through', () => {
  it('an explicit notification attribution wins over everything', () => {
    expect(classifyLaunch({ ...base, search: '?src_notif=abc', displayMode: 'standalone' })).toBe('notification');
    expect(classifyLaunch({ ...base, notificationMessage: true, referrer: 'https://x.example/' })).toBe('notification');
  });

  it('a broadcast link is a channel', () => {
    expect(classifyLaunch({ ...base, search: '?src=wa&c=sept', displayMode: 'standalone' })).toBe('channel');
  });

  it('an installed surface with no referrer is the home-screen icon', () => {
    for (const mode of ['standalone', 'twa', 'ios_app'] as const) {
      expect(classifyLaunch({ ...base, displayMode: mode })).toBe('icon');
    }
  });

  it('a browser tab with no referrer is direct (typed, bookmark, restored)', () => {
    expect(classifyLaunch(base)).toBe('direct');
  });

  it('a same-origin referrer is internal — a redirect or a reload, not an arrival', () => {
    expect(classifyLaunch({ ...base, referrer: 'https://careerrai.in/login' })).toBe('internal');
    // Host comparison, not string prefix: a look-alike origin is external.
    expect(classifyLaunch({ ...base, referrer: 'https://careerrai.in.evil.example/' })).toBe('external');
  });

  it('WhatsApp is named because it is the outreach channel', () => {
    expect(classifyLaunch({ ...base, referrer: 'android-app://com.whatsapp' })).toBe('whatsapp');
    expect(classifyLaunch({ ...base, referrer: 'https://l.wl.co/l?u=x' })).toBe('external');
  });

  it('never throws on garbage input', () => {
    expect(classifyLaunch({ ...base, search: '%%%', referrer: 'not a url' })).toBe('external');
    expect(classifyLaunch({ ...base, displayMode: 'unknown' })).toBe('unknown');
  });
});

describe('re-entry — how long away counts as coming back', () => {
  it('thirty minutes is the boundary and it is inclusive', () => {
    expect(REENTRY_GAP_MS).toBe(30 * 60_000);
    expect(isReentry(REENTRY_GAP_MS)).toBe(true);
    expect(isReentry(REENTRY_GAP_MS - 1)).toBe(false);
  });

  it('a nine-second excursion to a resource link is not a re-entry', () => {
    expect(isReentry(9_000)).toBe(false);
  });

  it('an unknown absence is never a re-entry', () => {
    expect(isReentry(null)).toBe(false);
    expect(isReentry(undefined)).toBe(false);
    expect(isReentry(Number.NaN)).toBe(false);
  });
});

describe('the away clock', () => {
  it('measures hidden → visible and resets', () => {
    const hidden = noteHidden({ hiddenAt: null }, 1_000);
    const back = noteVisible(hidden, 1_000 + REENTRY_GAP_MS);
    expect(back.hiddenMs).toBe(REENTRY_GAP_MS);
    expect(back.clock.hiddenAt).toBeNull();
  });

  it('a visible without a preceding hidden is unknown, not zero', () => {
    expect(noteVisible({ hiddenAt: null }, 5_000).hiddenMs).toBeNull();
  });

  it('a clock that ran backwards clamps to zero rather than going negative', () => {
    expect(noteVisible({ hiddenAt: 9_000 }, 5_000).hiddenMs).toBe(0);
  });
});
