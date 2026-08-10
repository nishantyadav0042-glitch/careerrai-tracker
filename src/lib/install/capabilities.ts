// Strategy resolution + the static capability matrix.
//
// resolveStrategy() turns a detected environment (plus two runtime facts — is a
// deferred prompt in hand, and does the OS already have the app) into exactly
// ONE strategy the UI acts on. This is the brain behind "one button, everything
// automatic": the button never changes, only the strategy it dispatches.

import type { CapabilityMatrixRow, InstallEnvironment, InstallStrategy } from './types';

export interface RuntimeInstallFacts {
  /** A Chromium beforeinstallprompt event is captured and ready to .prompt(). */
  hasDeferredPrompt: boolean;
  /** getInstalledRelatedApps()/standalone says the app is already on the device. */
  alreadyInstalled: boolean;
}

export function resolveStrategy(env: InstallEnvironment, facts: RuntimeInstallFacts): InstallStrategy {
  // 1. Already have it (running standalone, or OS reports it installed).
  if (env.isStandalone || facts.alreadyInstalled) return 'already-installed';

  const { platform, capabilities } = env;
  const isApple = platform === 'ios' || platform === 'ipados';

  // 2. iPhone/iPad → the App Store. This outranks EVERYTHING below, including
  //    the in-app-browser escape, and that ordering is the whole point.
  //
  //    Before the native app existed, the best iOS could do was Share → Add to
  //    Home Screen: 3 taps in Safari, 4 from Chrome, and from an Instagram or
  //    WhatsApp webview it was "escape to Safari" FIRST and then those 3 taps —
  //    a route with no completion signal at any step, so we could never even
  //    tell who fell out of it.
  //
  //    apps.apple.com is a universal link, so iOS hands it to the App Store app
  //    from inside those same webviews. The worst iOS path in the product just
  //    became the best one: one tap, from anywhere, and the install is a real
  //    App Store install we can see.
  if (isApple) return 'ios-app-store';

  // 3. Social / OS webview — cannot install anywhere. Route the escape by OS.
  //    (iOS is already handled above; this is the Android/other case.)
  if (capabilities.isInAppBrowser) {
    if (platform === 'android') return 'android-open-in-chrome'; // intent:// → Chrome
    return 'unsupported';
  }

  // 4. Chromium with a live prompt → the one-tap path.
  if (facts.hasDeferredPrompt && capabilities.mayFireBeforeInstallPrompt) return 'native-prompt';

  // 5. Chromium that SHOULD fire a prompt but hasn't yet → wait-then-prompt.
  if (capabilities.mayFireBeforeInstallPrompt) return 'native-prompt-pending';

  // The iOS Add-to-Home-Screen branch used to live here. It is gone from the
  // RESOLVER because rule 2 now catches every Apple device before this point —
  // leaving it would have been a branch that can never be taken. The A2HS
  // strategies still exist and are still reachable, but only by explicit
  // student choice: useInstall().addToHomeScreenInstead(), offered as the quiet
  // second option under the App Store card for anyone whose App Store won't
  // cooperate.

  // 6. Android browser with no prompt (Firefox; Opera when it misbehaves) →
  //    manual menu guide.
  if (platform === 'android') return 'android-manual-a2hs';

  // 7. Desktop Chromium without a captured prompt → generic install affordance.
  if (platform === 'desktop' && env.engine === 'chromium') return 'desktop-install';

  return 'unsupported';
}

// A human, one-line reason for the chosen strategy — surfaced in analytics and
// the /admin matrix so the routing is auditable, never a black box.
export function explainStrategy(strategy: InstallStrategy): string {
  switch (strategy) {
    case 'already-installed': return 'App already installed / running standalone.';
    case 'native-prompt': return 'Chromium install prompt ready — one tap.';
    case 'native-prompt-pending': return 'Chromium — waiting for the install prompt to arm.';
    case 'ios-app-store': return 'iPhone/iPad — the real native app on the App Store, one tap.';
    case 'ios-safari-a2hs': return 'iOS Safari — no API; animated Add-to-Home-Screen guide (Share at bottom).';
    case 'ios-browser-a2hs': return 'iOS Chrome/Edge/Firefox — Add to Home Screen via the share menu (16.4+).';
    case 'ios-browser-to-safari': return 'iOS non-Safari (old iOS) — reopen in Safari to install.';
    case 'android-open-in-chrome': return 'Android in-app browser — escape to Chrome to install.';
    case 'ios-open-in-safari': return 'iOS in-app browser — open in Safari to install.';
    case 'android-manual-a2hs': return 'Android browser without a prompt — manual menu guide.';
    case 'desktop-install': return 'Desktop Chromium — install from the address bar.';
    case 'unsupported': return 'No install path available here — offer bookmark / help.';
  }
}

// ---------------------------------------------------------------------------
// Static reference matrix — the source for the architecture doc and a future
// /admin/install-matrix debug view. Values reflect 2024–2025 sourced research.
// "expectedTaps" is the realistic best case including the browser's own confirm.
// ---------------------------------------------------------------------------

export const CAPABILITY_MATRIX: CapabilityMatrixRow[] = [
  { browser: 'Chrome', os: 'Android', supportsInstall: true, beforeInstallPrompt: true, addToHomeScreen: true, standalone: true, installedRelatedApps: true, strategy: 'native-prompt', expectedTaps: '2', risk: 'low', note: 'Mints a real WebAPK on GMS devices. Best case.' },
  { browser: 'Samsung Internet', os: 'Android', supportsInstall: true, beforeInstallPrompt: true, addToHomeScreen: true, standalone: true, installedRelatedApps: true, strategy: 'native-prompt', expectedTaps: '2', risk: 'low', note: 'Real WebAPK only on Samsung devices; else a shortcut.' },
  { browser: 'Edge', os: 'Android', supportsInstall: true, beforeInstallPrompt: true, addToHomeScreen: true, standalone: true, installedRelatedApps: true, strategy: 'native-prompt', expectedTaps: '2', risk: 'low', note: 'No WebAPK minting — installs a shortcut, not a true app.' },
  { browser: 'Brave', os: 'Android', supportsInstall: true, beforeInstallPrompt: true, addToHomeScreen: true, standalone: true, installedRelatedApps: true, strategy: 'native-prompt', expectedTaps: '2', risk: 'low', note: 'Prompt fires; creates a Brave-badged shortcut, not a WebAPK.' },
  { browser: 'Opera', os: 'Android', supportsInstall: true, beforeInstallPrompt: true, addToHomeScreen: true, standalone: true, installedRelatedApps: true, strategy: 'native-prompt-pending', expectedTaps: '2–3', risk: 'medium', note: 'beforeinstallprompt unreliable on mobile (2024 reports) — fall back to manual.' },
  { browser: 'Firefox', os: 'Android', supportsInstall: true, beforeInstallPrompt: false, addToHomeScreen: true, standalone: true, installedRelatedApps: false, strategy: 'android-manual-a2hs', expectedTaps: '3', risk: 'medium', note: 'No beforeinstallprompt ever. Menu → Install; shortcut only.' },
  { browser: 'Safari', os: 'iOS / iPadOS', supportsInstall: true, beforeInstallPrompt: false, addToHomeScreen: true, standalone: true, installedRelatedApps: false, strategy: 'ios-app-store', expectedTaps: '1', risk: 'low', note: 'Native app shipped 10 Aug 2026 — App Store universal link. A2HS stays as the quiet fallback.' },
  { browser: 'Chrome', os: 'iOS', supportsInstall: true, beforeInstallPrompt: false, addToHomeScreen: true, standalone: true, installedRelatedApps: false, strategy: 'ios-app-store', expectedTaps: '1', risk: 'low', note: 'App Store link works from any iOS browser — no A2HS menu-hunting needed.' },
  { browser: 'Edge', os: 'iOS', supportsInstall: true, beforeInstallPrompt: false, addToHomeScreen: true, standalone: true, installedRelatedApps: false, strategy: 'ios-app-store', expectedTaps: '1', risk: 'low', note: 'App Store link — same one-tap route as every other iOS browser.' },
  { browser: 'Firefox', os: 'iOS', supportsInstall: true, beforeInstallPrompt: false, addToHomeScreen: true, standalone: true, installedRelatedApps: false, strategy: 'ios-app-store', expectedTaps: '1', risk: 'low', note: 'App Store link — same one-tap route as every other iOS browser.' },
  { browser: 'Facebook', os: 'Android', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'android-open-in-chrome', expectedTaps: 'escape+2', risk: 'high', note: 'Webview. intent:// escape to Chrome, then native prompt.' },
  { browser: 'Facebook', os: 'iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'ios-app-store', expectedTaps: '1', risk: 'low', note: 'Was the worst path in the product (escape to Safari + 3 taps). The App Store universal link opens straight out of the webview.' },
  { browser: 'Instagram', os: 'Android', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'android-open-in-chrome', expectedTaps: 'escape+2', risk: 'high', note: 'Webview. intent:// escape to Chrome.' },
  { browser: 'Instagram', os: 'iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'ios-app-store', expectedTaps: '1', risk: 'low', note: 'Universal link opens the App Store app directly from the webview — no escape step.' },
  { browser: 'Messenger', os: 'Android', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'android-open-in-chrome', expectedTaps: 'escape+2', risk: 'high', note: 'Webview. intent:// escape to Chrome, then the native prompt.' },
  { browser: 'Messenger', os: 'iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'ios-app-store', expectedTaps: '1', risk: 'low', note: 'Universal link opens the App Store app straight out of the webview — no escape step.' },
  { browser: 'WhatsApp', os: 'Android', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'android-open-in-chrome', expectedTaps: 'escape+2', risk: 'high', note: 'Webview. intent:// escape to Chrome, then the native prompt.' },
  { browser: 'WhatsApp', os: 'iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'ios-app-store', expectedTaps: '1', risk: 'low', note: 'Universal link opens the App Store app straight out of the webview — no escape step.' },
  { browser: 'Telegram', os: 'Android', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'android-open-in-chrome', expectedTaps: 'escape+2', risk: 'medium', note: 'Webview. intent:// escape to Chrome, then the native prompt.' },
  { browser: 'Telegram', os: 'iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'ios-app-store', expectedTaps: '1', risk: 'low', note: 'Universal link opens the App Store app straight out of the webview — no escape step.' },
  { browser: 'X / Twitter', os: 'Android', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'android-open-in-chrome', expectedTaps: 'escape+2', risk: 'high', note: 'Webview. intent:// escape to Chrome, then the native prompt.' },
  { browser: 'X / Twitter', os: 'iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'ios-app-store', expectedTaps: '1', risk: 'low', note: 'Universal link opens the App Store app straight out of the webview — no escape step.' },
  { browser: 'LinkedIn', os: 'Android', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'android-open-in-chrome', expectedTaps: 'escape+2', risk: 'high', note: 'Webview. intent:// escape to Chrome, then the native prompt.' },
  { browser: 'LinkedIn', os: 'iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'ios-app-store', expectedTaps: '1', risk: 'low', note: 'Universal link opens the App Store app straight out of the webview — no escape step.' },
];
