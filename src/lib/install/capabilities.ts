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

  const { platform, browser, capabilities } = env;

  // 2. Social / OS webview — cannot install anywhere. Route the escape by OS.
  if (capabilities.isInAppBrowser) {
    if (platform === 'android') return 'android-open-in-chrome'; // intent:// → Chrome
    if (platform === 'ios' || platform === 'ipados') return 'ios-open-in-safari';
    return 'unsupported';
  }

  // 3. Chromium with a live prompt → the one-tap path.
  if (facts.hasDeferredPrompt && capabilities.mayFireBeforeInstallPrompt) return 'native-prompt';

  // 4. Chromium that SHOULD fire a prompt but hasn't yet → wait-then-prompt.
  if (capabilities.mayFireBeforeInstallPrompt) return 'native-prompt-pending';

  // 5. iOS family — no install API anywhere, but ALL of them can add to Home
  //    Screen via the share sheet since iOS 16.4/17. Safari puts Share at the
  //    bottom bar; the WebKit shells put it in their own share/⋯ menu.
  if (platform === 'ios' || platform === 'ipados') {
    if (browser === 'safari') return 'ios-safari-a2hs';
    return 'ios-browser-a2hs';
  }

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
  { browser: 'Safari', os: 'iOS / iPadOS', supportsInstall: true, beforeInstallPrompt: false, addToHomeScreen: true, standalone: true, installedRelatedApps: false, strategy: 'ios-safari-a2hs', expectedTaps: '3', risk: 'low', note: 'No scriptable install. Share → Add to Home Screen. Web push since iOS 16.4.' },
  { browser: 'Chrome', os: 'iOS', supportsInstall: true, beforeInstallPrompt: false, addToHomeScreen: true, standalone: true, installedRelatedApps: false, strategy: 'ios-browser-a2hs', expectedTaps: '3–4', risk: 'medium', note: 'WebKit shell. Share → Add to Home Screen from Chrome’s own menu (iOS 16.4+).' },
  { browser: 'Edge', os: 'iOS', supportsInstall: true, beforeInstallPrompt: false, addToHomeScreen: true, standalone: true, installedRelatedApps: false, strategy: 'ios-browser-a2hs', expectedTaps: '3–4', risk: 'medium', note: 'WebKit shell — A2HS via Edge’s share menu (iOS 16.4+).' },
  { browser: 'Firefox', os: 'iOS', supportsInstall: true, beforeInstallPrompt: false, addToHomeScreen: true, standalone: true, installedRelatedApps: false, strategy: 'ios-browser-a2hs', expectedTaps: '3–4', risk: 'medium', note: 'WebKit shell — A2HS via Firefox’s share menu (iOS 17+). Safari most reliable.' },
  { browser: 'Facebook', os: 'Android', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'android-open-in-chrome', expectedTaps: 'escape+2', risk: 'high', note: 'Webview. intent:// escape to Chrome, then native prompt.' },
  { browser: 'Facebook', os: 'iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'ios-open-in-safari', expectedTaps: 'escape+3', risk: 'high', note: 'Webview. "Open in Safari" from the ⋯ menu, then A2HS.' },
  { browser: 'Instagram', os: 'Android', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'android-open-in-chrome', expectedTaps: 'escape+2', risk: 'high', note: 'Webview. intent:// escape to Chrome.' },
  { browser: 'Instagram', os: 'iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'ios-open-in-safari', expectedTaps: 'escape+3', risk: 'high', note: 'Webview. ⋯ → Open in External Browser, then A2HS.' },
  { browser: 'Messenger', os: 'Android/iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'unsupported', expectedTaps: 'escape+2/3', risk: 'high', note: 'Webview. Escape by OS (intent:// / Open in Safari).' },
  { browser: 'WhatsApp', os: 'Android/iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'unsupported', expectedTaps: 'escape+2/3', risk: 'high', note: 'Opens system browser fairly readily — escape usually clean.' },
  { browser: 'Telegram', os: 'Android/iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'unsupported', expectedTaps: 'escape+2/3', risk: 'medium', note: 'Has "Open in browser" built in; escape reliable.' },
  { browser: 'X / Twitter', os: 'Android/iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'unsupported', expectedTaps: 'escape+2/3', risk: 'high', note: 'Webview. Escape by OS.' },
  { browser: 'LinkedIn', os: 'Android/iOS', supportsInstall: false, beforeInstallPrompt: false, addToHomeScreen: false, standalone: false, installedRelatedApps: false, strategy: 'unsupported', expectedTaps: 'escape+2/3', risk: 'high', note: 'Webview. Escape by OS.' },
];
