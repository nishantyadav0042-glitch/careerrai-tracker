import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { paymentSurface, needsBrowserHandoff, HANDOFF_COPY, type PaymentSurfaceSignals } from './payment-surface';

const base: PaymentSurfaceSignals = {
  escapedTab: false, iosStoreBuild: false, androidStoreBuild: false, ios: false, standalone: false,
};
const at = (o: Partial<PaymentSurfaceSignals>) => paymentSurface({ ...base, ...o });

describe('the iOS installed PWA never opens checkout in-page', () => {
  it('hands an installed iOS PWA a real link instead of the inline modal', () => {
    // THE BUG, in one assertion. This surface produced 7 opens, 7 dismissals
    // and 0 payments across 3 students and 21 taps, because it was neither
    // store build and so "fell straight through to inline Razorpay".
    expect(at({ ios: true, standalone: true })).toBe('ios_link_handoff');
  });

  it('leaves an iOS browser TAB inline — it is the one iOS path that has paid', () => {
    expect(at({ ios: true, standalone: false })).toBe('inline');
  });

  it('uses a link, never a scripted popup, on every iOS surface', () => {
    // window.open is ignored by WKWebView and blocked in a home-screen PWA,
    // and the wrapper paints a blank view over the app when it is called — so
    // the student gets a white screen with the fallback stranded underneath.
    for (const s of [{ iosStoreBuild: true }, { ios: true, standalone: true }]) {
      expect(at(s)).not.toBe('popup_handoff');
      expect(at(s)).toBe('ios_link_handoff');
    }
  });
});

describe('the escaped tab beats every other signal', () => {
  it('runs inline once we are already in the browser we handed off to', () => {
    // Otherwise the destination tab decides it is still iOS, still needs a
    // handoff, and offers to escape to a browser from inside the browser.
    expect(at({ escapedTab: true, ios: true, standalone: true })).toBe('inline');
    expect(at({ escapedTab: true, iosStoreBuild: true })).toBe('inline');
    expect(at({ escapedTab: true, androidStoreBuild: true })).toBe('inline');
  });

  it('cannot loop: the handoff destination never asks to hand off again', () => {
    const destination = { ...base, escapedTab: true, ios: true, standalone: true };
    expect(needsBrowserHandoff(destination)).toBe(false);
  });
});

describe('Android keeps the path that actually converted', () => {
  it('leaves the installed Android PWA inline', () => {
    // The only completed in-app payment we hold came from Android standalone.
    // Handing it off would break the one thing demonstrably working.
    expect(at({ standalone: true })).toBe('inline');
  });

  it('still opens a popup for the Play wrapper', () => {
    expect(at({ androidStoreBuild: true })).toBe('popup_handoff');
  });
});

describe('desktop and plain mobile browsers are untouched', () => {
  it('stays inline', () => {
    expect(at({})).toBe('inline');
    expect(needsBrowserHandoff(base)).toBe(false);
  });
});

describe('the handoff does not read like a failure', () => {
  it('never blames the student or implies the app broke', () => {
    // A student who reads "something went wrong" does not come back for the
    // second tap, and the second tap is the whole point.
    const all = Object.values(HANDOFF_COPY).join(' ').toLowerCase();
    for (const bad of ['error', 'failed', 'sorry', 'problem', 'went wrong', 'unable']) {
      expect(all, `handoff copy says "${bad}"`).not.toContain(bad);
    }
  });

  it('tells them what happens next', () => {
    expect(HANDOFF_COPY.ready).toMatch(/browser/i);
    expect(HANDOFF_COPY.button).toMatch(/payment/i);
  });
});

describe('both checkout surfaces route through this one decision', () => {
  // Two components can start a payment. If either keeps its own copy of the
  // rule they drift, and the one that drifts is the one nobody is watching.
  const surfaces = [
    'src/components/membership-card.tsx',
    'src/components/unlock-buddy-sheet.tsx',
  ];

  it('imports the shared decision rather than re-deriving it', () => {
    for (const f of surfaces) {
      expect(readFileSync(f, 'utf8'), `${f} does not use paymentSurface`)
        .toContain("from '@/lib/payment-surface'");
    }
  });

  it('no checkout surface tests for iOS or standalone on its own', () => {
    // The old shape — `if (isStoreBuild())` with an iOS branch inside — is
    // exactly what left the home-screen PWA falling through.
    for (const f of surfaces) {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${f} still hand-rolls a display-mode check`)
        .not.toMatch(/display-mode:\s*standalone/);
    }
  });
});
