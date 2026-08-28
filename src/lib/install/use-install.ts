'use client';

// InstallManager — the single hook the UI consumes. One button calls
// install(); this decides what actually happens based on the resolved strategy,
// fires analytics at every step, and exposes the state the UI renders.
//
// Design notes:
//  • The beforeinstallprompt event is captured at MODULE load, because Chrome
//    can fire it before React mounts (a component-effect listener misses it).
//  • getInstalledRelatedApps() closes the "installed but currently in a browser
//    tab" gap that display-mode/navigator.standalone cannot see (Chromium only).
//  • Nothing here sniffs the UA directly — it all flows through getEnvironment().

import { useCallback, useEffect, useRef, useState } from 'react';
import { track, flushEvents } from '@/lib/journey';
import { getEnvironment } from './detect';
import { resolveStrategy, explainStrategy } from './capabilities';
import { escapeInAppBrowser, mintHandoffUrl, openAppStore } from './actions';
import type { InstallEnvironment, InstallStrategy } from './types';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Module-level capture — survives React mounts/unmounts within the session.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let capturedInstalled = false;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event('cr-install-armed'));
  });
  window.addEventListener('appinstalled', () => {
    capturedInstalled = true;
    deferredPrompt = null;
    // TELL THE SERVER. This is the one signal that PROVES an install happened,
    // as opposed to install_click, which proves only that a button was tapped.
    // It was handled purely client-side until 29 Aug, which is why the
    // question "how many devices have ever installed CareerRai" had no
    // answerable form: every stored signal was either an intention (a tap) or
    // an observation of a launch (display_mode), never the install itself.
    // Fired before the redirect below and flushed immediately, because that
    // navigation would otherwise discard a queued event.
    try {
      track('app_installed', { source: 'appinstalled_event' });
      flushEvents();
    } catch { /* telemetry must never break an install */ }
    window.dispatchEvent(new Event('cr-install-done'));
    // Parity with the legacy button: after an Android install, forward this
    // browser tab into the app instead of stranding it on the marketing page.
    if (!window.matchMedia?.('(display-mode: standalone)').matches) {
      window.setTimeout(() => { window.location.href = '/student/tracker'; }, 700);
    }
  });
}

export type InstallUiKind =
  | 'hidden'          // already installed / running standalone — show nothing
  | 'button'          // a plain Install button that does the right thing on tap
  | 'ios-app-store'   // iPhone/iPad — the real App Store card, one tap
  | 'android-guide'   // show the manual Android menu guide
  | 'escape-sheet'    // Android in-app browser — show "open in Chrome" CTA
  | 'unsupported';    // offer bookmark / WhatsApp help

export interface InstallState {
  env: InstallEnvironment;
  strategy: InstallStrategy;
  reason: string;
  ui: InstallUiKind;
  installed: boolean;
  /** A native Chromium prompt is armed and ready to fire this instant. */
  armed: boolean;
  busy: boolean;
}

function uiFor(strategy: InstallStrategy): InstallUiKind {
  switch (strategy) {
    case 'already-installed': return 'hidden';
    case 'ios-app-store': return 'ios-app-store';
    case 'native-prompt':
    case 'native-prompt-pending':
    case 'desktop-install': return 'button';
    case 'android-manual-a2hs': return 'android-guide';
    case 'android-open-in-chrome': return 'escape-sheet';
    case 'unsupported': return 'unsupported';
  }
}

async function checkInstalledRelatedApps(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ platform?: string; id?: string; url?: string }>>;
    };
    if (typeof nav.getInstalledRelatedApps !== 'function') return false;
    const apps = await nav.getInstalledRelatedApps();
    return Array.isArray(apps) && apps.length > 0;
  } catch {
    return false;
  }
}

function waitForArmedPrompt(timeoutMs: number): Promise<BeforeInstallPromptEvent | null> {
  if (deferredPrompt) return Promise.resolve(deferredPrompt);
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: BeforeInstallPromptEvent | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener('cr-install-armed', onArmed);
      resolve(v);
    };
    const onArmed = () => done(deferredPrompt);
    const timer = setTimeout(() => done(null), timeoutMs);
    window.addEventListener('cr-install-armed', onArmed);
  });
}

export interface UseInstallResult extends InstallState {
  /** The single action the one button calls. Does the right thing per strategy. */
  install: () => Promise<void>;
  /** True after the environment has been read on the client (avoids SSR flash). */
  ready: boolean;
}

export function useInstall(): UseInstallResult {
  const [state, setState] = useState<InstallState | null>(null);
  const [ready, setReady] = useState(false);
  const busyRef = useRef(false);

  const recompute = useCallback(async () => {
    const env = getEnvironment();
    // env.isNativeShell short-circuits everything: inside the App Store /
    // Play Store build the app IS installed, so every install CTA hides.
    const alreadyInstalled =
      capturedInstalled || env.isNativeShell || (await checkInstalledRelatedApps());
    const strategy = resolveStrategy(env, {
      hasDeferredPrompt: deferredPrompt != null,
      alreadyInstalled,
    });
    setState({
      env,
      strategy,
      reason: explainStrategy(strategy),
      ui: uiFor(strategy),
      installed: env.isStandalone || alreadyInstalled,
      armed: deferredPrompt != null,
      busy: busyRef.current,
    });
    setReady(true);
  }, []);

  useEffect(() => {
    void recompute();
    const onArmed = () => void recompute();
    const onDone = () => void recompute();
    const onVisible = () => { if (document.visibilityState === 'visible') void recompute(); };
    window.addEventListener('cr-install-armed', onArmed);
    window.addEventListener('cr-install-done', onDone);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('cr-install-armed', onArmed);
      window.removeEventListener('cr-install-done', onDone);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [recompute]);

  const install = useCallback(async () => {
    if (!state || busyRef.current) return;
    const { env, strategy } = state;
    busyRef.current = true;
    setState((s) => (s ? { ...s, busy: true } : s));
    track('install_click', { strategy, browser: env.browser, platform: env.platform, inApp: env.inApp });

    try {
      switch (strategy) {
        case 'native-prompt':
        case 'native-prompt-pending':
        case 'desktop-install': {
          const prompt = deferredPrompt ?? (await waitForArmedPrompt(3000));
          if (!prompt) {
            track('install_prompt_unavailable', { strategy, browser: env.browser });
            // Chromium said installable but no prompt arrived → fall back to the
            // manual guide rather than dead-ending.
            window.location.href = await mintHandoffUrl();
            return;
          }
          track('install_prompt_shown', { browser: env.browser, platform: env.platform });
          await prompt.prompt();
          const choice = await prompt.userChoice;
          track('install_prompt_result', { outcome: choice.outcome, browser: env.browser });
          deferredPrompt = null;
          break;
        }
        case 'ios-app-store': {
          track('install_app_store', { platform: env.platform, browser: env.browser, inApp: env.inApp });
          openAppStore();
          break;
        }
        case 'android-open-in-chrome': {
          track('install_escape', { inApp: env.inApp, platform: env.platform });
          escapeInAppBrowser(env);
          break;
        }
        case 'android-manual-a2hs': {
          // These are UI-driven (coachmark/guide). Mint a logged-in hand-off so
          // the installed icon opens signed in, and let the caller render the
          // guide. We navigate to /app which carries the token + instructions.
          track('install_guide_shown', { strategy, browser: env.browser, platform: env.platform });
          window.location.href = await mintHandoffUrl();
          break;
        }
        case 'already-installed':
          track('install_already', { platform: env.platform });
          break;
        case 'unsupported':
          track('install_unsupported', { browser: env.browser, inApp: env.inApp });
          break;
      }
    } finally {
      busyRef.current = false;
      void recompute();
    }
  }, [state, recompute]);

  // Neutral SSR/first-paint state until the client read completes.
  const base: InstallState =
    state ?? {
      env: getEnvironment(),
      strategy: 'native-prompt-pending',
      reason: '',
      ui: 'button',
      installed: false,
      armed: false,
      busy: false,
    };

  return { ...base, install, ready };
}
