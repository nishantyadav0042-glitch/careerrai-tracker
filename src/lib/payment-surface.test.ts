import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { paymentSurface, handoffReachedBrowser, type PaymentSurfaceSignals } from './payment-surface';

const base: PaymentSurfaceSignals = {
  escapedTab: false, iosStoreBuild: false, androidStoreBuild: false, ios: false, standalone: false,
};
const at = (o: Partial<PaymentSurfaceSignals>) => paymentSurface({ ...base, ...o });

describe('the iOS installed PWA never opens checkout in-page', () => {
  it('never gives an installed iOS PWA the inline modal', () => {
    // THE ORIGINAL BUG, still guarded. This surface produced 7 opens, 7
    // dismissals and 0 payments across 3 students and 21 taps, because it was
    // neither store build and so "fell straight through to inline Razorpay".
    expect(at({ ios: true, standalone: true })).not.toBe('inline');
  });

  it('uses REDIRECT here, not the hand-off that cannot escape', () => {
    // 25 Aug: the hand-off was the wrong cure. A WKWebView honours a real
    // anchor and reaches Safari; an installed PWA does NOT — target="_blank"
    // navigates inside the app, so the link landed on our own /go page, which
    // then asked the student to tap share and choose "Open in Safari" by hand.
    // Three taps and a system menu to buy. Redirect needs no escape at all.
    expect(at({ ios: true, standalone: true })).toBe('redirect');
  });

  it('REDIRECTS an iOS browser tab too — reversed 25 Aug', () => {
    // This test used to assert 'inline', on the strength of the single
    // completed payment in the table at the top of payment-surface.ts ("iOS,
    // browser tab — 1 opened, 1 PAID"). One is not a sample.
    //
    // Razorpay's modal is a cross-origin iframe, and mobile Safari blocks
    // cross-origin popups FROM an iframe whether or not the page is
    // standalone — so a UPI, netbanking or 3-D Secure step dead-ends in a
    // Safari tab for the same reason it dead-ends in a PWA. Redirect mode has
    // no iframe and no popup to be denied.
    expect(at({ ios: true, standalone: false })).toBe('redirect');
  });

  it('never uses a scripted popup on any iOS surface', () => {
    // window.open is ignored by WKWebView and blocked in a home-screen PWA,
    // and the wrapper paints a blank view over the app when it is called — so
    // the student gets a white screen with the fallback stranded underneath.
    // This rule is unchanged; only the cure differs per surface.
    for (const s of [{ iosStoreBuild: true }, { ios: true, standalone: true }]) {
      expect(at(s)).not.toBe('popup_handoff');
    }
  });

  it('the wrapper redirects too — no copy-the-link screen anywhere', () => {
    // The wrapper CAN escape with an anchor, but escaping only ever led to
    // /go and its 96% drop-off. Navigating straight to Razorpay is one tap.
    expect(at({ iosStoreBuild: true })).toBe('redirect');
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

  it('cannot loop: the escaped tab pays in place', () => {
    const destination = { ...base, escapedTab: true, ios: true, standalone: true };
    expect(paymentSurface(destination)).toBe('inline');
  });
});

describe('Android keeps the path that actually converted', () => {
  it('leaves the installed Android PWA inline', () => {
    // The only completed in-app payment we hold came from Android standalone.
    // Handing it off would break the one thing demonstrably working.
    expect(at({ standalone: true })).toBe('inline');
  });

  it('the Play wrapper redirects rather than opening a second tab', () => {
    // window.open works there, but it only moved the student to /go. One tap
    // in place beats a new tab that then asks them to continue.
    expect(at({ androidStoreBuild: true })).toBe('redirect');
  });
});

describe('desktop and plain mobile browsers are untouched', () => {
  it('stays inline', () => {
    expect(at({})).toBe('inline');
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

