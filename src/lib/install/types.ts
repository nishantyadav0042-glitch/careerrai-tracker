// Install system — shared types.
//
// The whole install experience is "one button, everything else automatic."
// That automation is driven by a single detected `InstallEnvironment` + a
// resolved `InstallStrategy`. Every component and hook reads these types; no
// component sniffs the user-agent on its own anymore.

export type Platform = 'android' | 'ios' | 'ipados' | 'desktop' | 'other';

// Rendering engine. On iOS EVERY browser is WebKit (Apple forces it), which is
// why third-party iOS browsers behave like Safari for install purposes.
export type Engine = 'chromium' | 'webkit' | 'gecko' | 'unknown';

// The concrete browser, as far as it matters for installability.
export type BrowserName =
  | 'chrome'
  | 'samsung'
  | 'edge'
  | 'firefox'
  | 'brave'
  | 'opera'
  | 'safari'
  | 'chrome-ios'   // Chrome UI, WebKit engine
  | 'edge-ios'     // Edge UI, WebKit engine
  | 'firefox-ios'  // Firefox UI, WebKit engine
  | 'webview'      // generic OS webview (not a social app we recognise)
  | 'unknown';

// Social / messaging in-app browsers (webviews). None can install a PWA; the
// job here is to detect them precisely so we can offer the right escape.
export type InAppBrowser =
  | 'facebook'
  | 'instagram'
  | 'messenger'
  | 'whatsapp'
  | 'telegram'
  | 'twitter'
  | 'linkedin'
  | 'line'
  | 'snapchat'
  | 'wechat'
  | 'pinterest'
  | 'generic-webview'
  | null;

export type DisplayMode = 'standalone' | 'minimal-ui' | 'fullscreen' | 'browser' | 'unknown';

// The single decision the UI acts on. Exactly one strategy per environment.
export type InstallStrategy =
  | 'already-installed'      // running standalone, or getInstalledRelatedApps says installed → hide/΄open app΄
  | 'native-prompt'          // Chromium beforeinstallprompt available → one tap
  | 'native-prompt-pending'  // Chromium, prompt not fired yet → wait, then one tap
  // iOS has exactly ONE install answer: the App Store. The four Add-to-Home-
  // Screen / open-in-Safari strategies that used to live here were deleted on
  // 10 Aug — a native app makes every one of them a worse route to the same
  // place, and keeping them meant two ways to install on one platform.
  // The in-app-browser escape (InAppBrowserEscape) no longer sends iPhones to
  // Safari either — it hands them the App Store card, because a universal link
  // opens straight out of a webview.
  | 'ios-app-store'          // iPhone/iPad → the real native app on the App Store (one tap)
  | 'android-open-in-chrome' // Android in-app/OEM browser → intent:// escape to Chrome
  | 'android-manual-a2hs'    // Android browser without a prompt (Firefox) → manual menu guide
  | 'desktop-install'        // desktop Chromium → address-bar / prompt install
  | 'unsupported';           // genuinely nowhere to go (rare) → offer bookmark / WhatsApp help

export interface InstallCapabilities {
  /** Chromium `beforeinstallprompt` can fire here (best-effort inference). */
  mayFireBeforeInstallPrompt: boolean;
  /** A real, scriptable one-tap install is achievable in THIS context. */
  canOneTapInstallHere: boolean;
  /** The manual "Add to Home Screen" path exists in this browser. */
  supportsAddToHomeScreen: boolean;
  /** This is a social/OS webview that cannot install — needs an escape. */
  isInAppBrowser: boolean;
  /** `getInstalledRelatedApps()` exists (Chromium/Android). */
  supportsInstalledRelatedApps: boolean;
  /** We can detect standalone launch reliably. */
  supportsStandaloneDetection: boolean;
}

export interface InstallEnvironment {
  platform: Platform;
  engine: Engine;
  browser: BrowserName;
  inApp: InAppBrowser;
  displayMode: DisplayMode;
  isStandalone: boolean;
  /**
   * Running inside the App Store / Play Store build (start URL carries
   * ?source=ios-app | android-app | twa, persisted thereafter). Install CTAs
   * must never render here — see detectNativeShell().
   */
  isNativeShell: boolean;
  capabilities: InstallCapabilities;
  /** Raw UA kept for analytics + debugging only — never for control flow if avoidable. */
  ua: string;
}

// One row of the static browser capability matrix (docs + the /admin matrix view).
export interface CapabilityMatrixRow {
  browser: string;
  os: string;
  supportsInstall: boolean;
  beforeInstallPrompt: boolean;
  addToHomeScreen: boolean;
  standalone: boolean;
  installedRelatedApps: boolean;
  strategy: InstallStrategy;
  expectedTaps: string; // best-case, e.g. "1" or "2–3" or "escape+2"
  risk: 'low' | 'medium' | 'high';
  note: string;
}
