import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveStrategy, explainStrategy, CAPABILITY_MATRIX } from './capabilities';
import type { InstallEnvironment, InstallStrategy, Platform, BrowserName, InAppBrowser } from './types';

// ── The whole onboarding journey, both platforms, end to end. ───────────────
//
// Founder, 10 Aug: "test the complete journey, it shouldn't be broken and it
// should be error free — for both iOS and Android."
//
// The install journey is the one flow where a break is invisible: nobody files
// a bug for a screen that quietly sends them nowhere, they just never come
// back. So this walks BOTH platforms through every station and asserts the
// route is complete, non-duplicated, and never contradicts itself.

function env(over: Partial<InstallEnvironment> = {}): InstallEnvironment {
  return {
    platform: 'ios' as Platform,
    engine: 'webkit',
    browser: 'safari' as BrowserName,
    inApp: null as InAppBrowser,
    displayMode: 'browser',
    isStandalone: false,
    isNativeShell: false,
    capabilities: {
      mayFireBeforeInstallPrompt: false,
      canOneTapInstallHere: false,
      supportsAddToHomeScreen: true,
      isInAppBrowser: false,
      supportsInstalledRelatedApps: false,
      supportsStandaloneDetection: true,
    },
    ua: '',
    ...over,
  };
}
const FRESH = { hasDeferredPrompt: false, alreadyInstalled: false };

const src = (p: string) => readFileSync(p, 'utf8');
const SEQUENCE = src('src/components/post-signup-sequence.tsx');
const BUTTON   = src('src/components/install/install-button.tsx');
const CARD     = src('src/components/install/app-store-card.tsx');
const JOURNEY  = src('src/components/install-journey.tsx');
const APP_PAGE = src('src/app/app/page.tsx');

/** Strip comments so prose about a route doesn't read as the route. */
function code(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

// ── Every environment resolves to exactly one live route ───────────────────

const EVERY_ENV: { name: string; env: InstallEnvironment; expect: InstallStrategy }[] = [
  { name: 'iPhone · Safari',            env: env(),                                                   expect: 'ios-app-store' },
  { name: 'iPhone · Chrome',            env: env({ browser: 'chrome-ios' }),                          expect: 'ios-app-store' },
  { name: 'iPhone · Instagram webview', env: env({ browser: 'webview', inApp: 'instagram', capabilities: { ...env().capabilities, isInAppBrowser: true } }), expect: 'ios-app-store' },
  { name: 'iPad · Safari',              env: env({ platform: 'ipados' }),                             expect: 'ios-app-store' },
  { name: 'Android · Chrome (armed)',   env: env({ platform: 'android', engine: 'chromium', browser: 'chrome', capabilities: { ...env().capabilities, mayFireBeforeInstallPrompt: true } }), expect: 'native-prompt' },
  { name: 'Android · Firefox',          env: env({ platform: 'android', engine: 'gecko', browser: 'firefox' }), expect: 'android-manual-a2hs' },
  { name: 'Android · Instagram webview',env: env({ platform: 'android', browser: 'webview', inApp: 'instagram', capabilities: { ...env().capabilities, isInAppBrowser: true } }), expect: 'android-open-in-chrome' },
  { name: 'Desktop Chrome',             env: env({ platform: 'desktop', engine: 'chromium', browser: 'chrome' }), expect: 'desktop-install' },
];

describe('every environment lands on a real route', () => {
  for (const c of EVERY_ENV) {
    it(`${c.name} → ${c.expect}`, () => {
      const strategy = resolveStrategy(c.env, c.name.includes('armed') ? { ...FRESH, hasDeferredPrompt: true } : FRESH);
      expect(strategy).toBe(c.expect);
      // A strategy with no explanation is a dead end in the admin view and in
      // analytics — the two places we'd look to find out why nobody installed.
      expect(explainStrategy(strategy).length).toBeGreaterThan(10);
    });
  }

  it('the installed app shows no install CTA anywhere', () => {
    // Both shells: iOS native (isNativeShell → alreadyInstalled) and PWA.
    expect(resolveStrategy(env({ isStandalone: true }), FRESH)).toBe('already-installed');
    expect(resolveStrategy(env({ platform: 'android', isStandalone: true }), FRESH)).toBe('already-installed');
    expect(resolveStrategy(env(), { ...FRESH, alreadyInstalled: true })).toBe('already-installed');
  });
});

// ── No duplication: one route per platform ─────────────────────────────────

describe('zero duplicated install routes', () => {
  it('iOS has exactly ONE strategy — the App Store', () => {
    // Founder, 10 Aug: "I repeat, zero duplicated." Every Apple environment,
    // however it arrives, must land on the same single route.
    const appleStrategies = new Set(
      EVERY_ENV.filter((c) => /iPhone|iPad/.test(c.name))
        .map((c) => resolveStrategy(c.env, FRESH))
    );
    expect([...appleStrategies]).toEqual(['ios-app-store']);
  });

  it('the dead iOS Add-to-Home-Screen strategies are gone, not just unused', () => {
    const types = src('src/lib/install/types.ts');
    for (const dead of ['ios-safari-a2hs', 'ios-browser-a2hs', 'ios-browser-to-safari', 'ios-open-in-safari']) {
      expect(code(types)).not.toContain(dead);
    }
    // ...and nothing still branches on the coachmark UI that rendered them.
    for (const file of [BUTTON, JOURNEY, SEQUENCE, APP_PAGE]) {
      expect(code(file)).not.toContain('ios-coachmark');
    }
  });

  it('the iPhone card offers one action and no second install route', () => {
    const c = code(CARD);
    expect(c).toContain('Download on the App Store');
    // The "Add to Home Screen instead" fallback was removed on the founder's
    // call: a platform with a real native app should not also teach a worse way
    // to install the same thing.
    expect(c).not.toMatch(/Add to Home Screen/i);
    expect(c).not.toContain('onFallback');
  });

  it('the App Store URL is defined once and never pasted inline', () => {
    const linkFile = src('src/lib/install/store-links.ts');
    expect(linkFile).toContain('apps.apple.com/in/app/careerrai/id6792102977');
    // Stripped of comments: the card's header prose legitimately explains why a
    // bare apps.apple.com URL is the wrong thing to put in front of a student.
    for (const file of [BUTTON, CARD, JOURNEY, SEQUENCE, APP_PAGE]) {
      expect(code(file)).not.toContain('apps.apple.com');
    }
  });
});

// ── The journey has no gaps or contradictions ──────────────────────────────

describe('post-signup journey, both platforms', () => {
  const seq = code(SEQUENCE);

  it('iPhone skips the how-to-install screen entirely', () => {
    // The App Store installs the app itself; a "here's how to add it" screen
    // after that asks a student who has already finished to keep going.
    expect(seq).toContain("setStep(isIphone ? 'promises' : 'openApp')");
  });

  it('iPhone gets a rail with no skipped station in it', () => {
    // A station we render and then jump over leaves a visible hole in the
    // progress rail on our smoothest journey.
    expect(seq).toContain('JOURNEY_IPHONE');
    expect(seq).toContain('const stations = isIphone ? JOURNEY_IPHONE : JOURNEY');
    // Every rail must be driven by `stations`, never the fixed Android list.
    const rails = seq.match(/<JourneyRail[^/]*\/>/g) ?? [];
    expect(rails.length).toBeGreaterThan(0);
    for (const r of rails) expect(r).toContain('stations={stations}');
  });

  it('the Android guide is still wired in and unchanged', () => {
    // Founder: "keep the android link there only" — iOS changes must not have
    // touched the Android route.
    expect(seq).toContain('AndroidInstallGuide');
    const guide = code(src('src/components/install/android-install-guide.tsx'));
    expect(guide).toContain('Add to Home screen');
    expect(guide).toContain('careerrai.in');
    // And it must not have grown an iOS branch again.
    expect(guide).not.toMatch(/\bios\b/i);
    expect(guide).not.toMatch(/Safari|App Store/);
  });

  it('no screen still promises "~3 MB" to an iPhone', () => {
    // That was a PWA fact. The App Store card states the real size.
    const installFirst = seq.slice(seq.indexOf("step === 'installFirst'"), seq.indexOf("step === 'openApp'"));
    expect(installFirst).not.toContain('3 MB');
  });

  it('the /app entry routes each platform to its own one thing', () => {
    const page = code(APP_PAGE);
    expect(page).toContain("ui === 'ios-app-store'");
    expect(page).toContain('AndroidInstallGuide');
    // An iPhone landing here must never be shown Android's ⋮ menu steps.
    expect(page).toContain('isIphone ? <InstallButton /> : <AndroidInstallGuide />');
  });
});

// ── The matrix stays honest ────────────────────────────────────────────────

describe('the published capability matrix', () => {
  it('never advertises a strategy the resolver can no longer return', () => {
    const live = new Set<InstallStrategy>([
      'already-installed', 'native-prompt', 'native-prompt-pending', 'ios-app-store',
      'android-open-in-chrome', 'android-manual-a2hs', 'desktop-install', 'unsupported',
    ]);
    for (const row of CAPABILITY_MATRIX) {
      expect(live.has(row.strategy)).toBe(true);
    }
  });

  it('agrees with the resolver that every iOS row is one tap', () => {
    for (const row of CAPABILITY_MATRIX.filter((r) => r.os.includes('iOS'))) {
      expect(row.strategy).toBe('ios-app-store');
      expect(row.expectedTaps).toBe('1');
    }
  });

  it('still documents Android honestly — it really is more taps', () => {
    const androidRows = CAPABILITY_MATRIX.filter((r) => r.os === 'Android');
    expect(androidRows.length).toBeGreaterThan(4);
    // Founder: "for Android it's a bit tough still, but yeah." Nothing here
    // should claim otherwise.
    expect(androidRows.every((r) => r.expectedTaps !== '1')).toBe(true);
  });
});
