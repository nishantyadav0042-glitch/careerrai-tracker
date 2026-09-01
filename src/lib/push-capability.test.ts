import { describe, it, expect } from 'vitest';
import { pushCapabilityFrom, type SurfaceSignals } from './push-capability';

const base: SurfaceSignals = { standalone: false, isApple: false, isStoreWrapper: false, hasPushApis: true };
const S = (o: Partial<SurfaceSignals> = {}): SurfaceSignals => ({ ...base, ...o });

describe('push capability — the surfaces that CAN receive', () => {
  it('Android/desktop installed PWA can receive', () => {
    const c = pushCapabilityFrom(S({ standalone: true }));
    expect(c).toEqual({ surface: 'standalone', canReceive: true, remedy: 'none' });
  });

  it('iOS HOME SCREEN PWA can receive — the defect this module exists for', () => {
    // navigator.standalone === true on an iOS Home Screen PWA, so the old
    // `if (isIOS()) return;` threw away the ONE iOS surface that works. All six
    // web.push.apple.com subscriptions we hold live here.
    const c = pushCapabilityFrom(S({ standalone: true, isApple: true }));
    expect(c.canReceive, 'iOS Home Screen PWA must be askable').toBe(true);
    expect(c.surface).toBe('ios_pwa');
  });
});

describe('push capability — the surfaces that CANNOT, and what each needs', () => {
  it('the iOS App Store wrapper can never receive, and needs a DIFFERENT install', () => {
    const c = pushCapabilityFrom(S({ isApple: true, isStoreWrapper: true }));
    expect(c).toEqual({
      surface: 'ios_wrapper', canReceive: false, reason: 'ios_wrapper', remedy: 'add_to_home_screen',
    });
  });

  it('the wrapper is judged BEFORE standalone, so it is never told to install the app it has', () => {
    // A WKWebView never matches display-mode:standalone. Without the ordering
    // it would fall into 'not_standalone' and be told to install CareerRai —
    // which the student already did, from the App Store.
    const c = pushCapabilityFrom(S({ isApple: true, isStoreWrapper: true, standalone: false }));
    expect(c.reason).toBe('ios_wrapper');
    expect(c.reason).not.toBe('not_standalone');
  });

  it('a browser tab is asked to install, not prompted', () => {
    expect(pushCapabilityFrom(S({ isApple: false })).remedy).toBe('install_app');
  });

  it('an iPhone in a Safari TAB is sent to Add to Home Screen, not the App Store', () => {
    const c = pushCapabilityFrom(S({ isApple: true, isStoreWrapper: false, standalone: false }));
    expect(c.reason).toBe('not_standalone');
    expect(c.remedy, 'iPhone must not be told to "install app"').toBe('add_to_home_screen');
  });

  it('a browser with no Push APIs has no remedy — we must not pretend otherwise', () => {
    const c = pushCapabilityFrom(S({ standalone: true, hasPushApis: false }));
    expect(c).toEqual({ surface: 'unsupported', canReceive: false, reason: 'unsupported', remedy: 'none' });
  });

  it('missing APIs beat standalone — an installed surface can still be incapable', () => {
    expect(pushCapabilityFrom(S({ standalone: true, isApple: true, hasPushApis: false })).canReceive).toBe(false);
  });
});

describe('the capability rule is total', () => {
  it('every combination of signals returns a coherent answer', () => {
    for (const standalone of [true, false]) {
      for (const isApple of [true, false]) {
        for (const isStoreWrapper of [true, false]) {
          for (const hasPushApis of [true, false]) {
            const c = pushCapabilityFrom({ standalone, isApple, isStoreWrapper, hasPushApis });
            // canReceive and reason are mutually exclusive, always.
            expect(c.canReceive ? c.reason === undefined : c.reason !== undefined).toBe(true);
            // A remedy is only ever offered to someone who cannot receive.
            if (c.canReceive) expect(c.remedy).toBe('none');
          }
        }
      }
    }
  });
});

// ── ONE AUTHORITY, ENFORCED ────────────────────────────────────────────────
//
// Founder rule, 1 Sep: "There must remain one authority per responsibility…
// Do not create a second notification system to fix the first one."
//
// This module exists BECAUSE that rule was already being broken quietly — the
// same isStandalone()/isIOS() pair was written inline in three components, and
// only one of them carried the iOS-PWA defect. A guard is the only thing that
// stops the fourth copy.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('capability detection has exactly one home', () => {
  it('no file outside push-capability.ts decides push capability from display-mode + iOS', () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      if (f.endsWith(join('lib', 'push-capability.ts'))) continue;
      const s = strip(readFileSync(f, 'utf8'));
      // The signature of a hand-rolled copy: reading standalone AND deciding
      // on Apple-ness in the same file, for a push decision.
      const readsStandalone = /display-mode:\s*standalone|navigator\)?\.standalone/.test(s);
      const decidesApple = /iPad\|iPhone\|iPod|MacIntel/.test(s);
      if (readsStandalone && decidesApple && /push|notif/i.test(s)) {
        offenders.push(f.replace(SRC, 'src'));
      }
    }
    expect(offenders, `these files re-derive push capability instead of importing it:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('a surface that cannot receive is never reported as an ask', () => {
    // push_ask_shown drives the acquisition funnel. Counting guidance as an
    // ask would inflate it and hide the real permission conversion rate.
    const ask = readFileSync(join(SRC, 'components', 'standalone-notif-ask.tsx'), 'utf8');
    expect(ask).toContain("track('push_setup_guidance_shown'");
    expect(ask).toMatch(/outcome === 'shown'[\s\S]*?push_ask_shown/);
  });
});
