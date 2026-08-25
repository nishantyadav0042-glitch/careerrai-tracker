import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { paymentSurface, needsBrowserHandoff, handoffReachedBrowser, HANDOFF_COPY, type PaymentSurfaceSignals } from './payment-surface';

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

  it('leaves an iOS browser TAB inline — it is the one iOS path that has paid', () => {
    expect(at({ ios: true, standalone: false })).toBe('inline');
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

  it('the Play wrapper redirects rather than opening a second tab', () => {
    // window.open works there, but it only moved the student to /go. One tap
    // in place beats a new tab that then asks them to continue.
    expect(at({ androidStoreBuild: true })).toBe('redirect');
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

describe('the hand-off must prove it reached a browser before acting like one', () => {
  it('knows an iOS home-screen window is NOT the browser', () => {
    // navigator.standalone === true is iOS-only and means "home-screen web
    // app". /go running here has not escaped anything.
    expect(handoffReachedBrowser({ standalone: true })).toBe(false);
  });

  it('treats a real Safari tab and an in-app Safari view as the browser', () => {
    expect(handoffReachedBrowser({ standalone: false })).toBe(true);
    expect(handoffReachedBrowser({})).toBe(true);
  });

  it('does NOT use the display-mode media query, which would break Android', () => {
    // An Android Chrome Custom Tab matches `display-mode: standalone` and IS a
    // real browser where Razorpay works. Only the iOS-specific
    // navigator.standalone flag distinguishes the two, and 3 of the 7 tokens
    // ever consumed were Android students on exactly that path.
    const androidCustomTab = { /* no `standalone` property at all */ };
    expect(handoffReachedBrowser(androidCustomTab)).toBe(true);
  });

  it('fails open — an unknown environment is treated as a browser', () => {
    // Refusing to hand off on an environment we cannot read would strand a
    // student who might have been fine. The inline path still has the
    // paymentSurface guard in front of it.
    expect(handoffReachedBrowser(null)).toBe(true);
    expect(handoffReachedBrowser(undefined)).toBe(true);
  });

  it('/go only marks the payment tab after that check passes', () => {
    const go = readFileSync('src/app/go/page.tsx', 'utf8');
    expect(go).toContain('handoffReachedBrowser');
    // The guard must precede the marker, or it is decoration.
    expect(go.indexOf('handoffReachedBrowser')).toBeLessThan(go.indexOf('markPaymentTab()'));
  });

  it('/go does not spend the token when it did not reach a browser', () => {
    // The token stays valid so the SAME link still works once they open it in
    // Safari. Burning it here is what left 153 of 160 minted links unusable.
    const go = readFileSync('src/app/go/page.tsx', 'utf8');
    const guard = go.indexOf('handoffReachedBrowser');
    const exchange = go.indexOf('/api/install/exchange');
    expect(guard).toBeLessThan(exchange);
    expect(go).toMatch(/setStuckInApp\(true\);\s*\n\s*return;/);
  });
});
