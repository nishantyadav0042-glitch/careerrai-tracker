// Install actions — the concrete side-effects a strategy triggers. Kept apart
// from detection (pure) and the hook (state) so each escape can be unit-tested
// in isolation. All are best-effort and SSR-safe.

import type { InAppBrowser, InstallEnvironment } from './types';
import { APP_STORE_URL } from './store-links';

function loc(): Location | null {
  return typeof window !== 'undefined' ? window.location : null;
}

/** Current URL, minus any hash — the thing we want the real browser to open. */
export function currentUrl(): string {
  const l = loc();
  if (!l) return '';
  return `${l.origin}${l.pathname}${l.search}`;
}

// ---------------------------------------------------------------------------
// Android: escape a webview into real Chrome so the install prompt can fire.
// ---------------------------------------------------------------------------

/**
 * Build an `intent://` URL that forces Chrome, with an https fallback if Chrome
 * is absent. Syntax per Chrome's Android Intents doc.
 */
export function buildChromeIntentUrl(url = currentUrl()): string {
  const l = loc();
  if (!l) return url;
  const hostAndPath = `${l.host}${l.pathname}${l.search}`;
  const fallback = encodeURIComponent(url);
  return `intent://${hostAndPath}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}

/**
 * Escape the current Android in-app browser into Chrome.
 *
 * Instagram's webview is known to route plain `intent://` to the Play Store
 * instead of Chrome, so for Instagram we try the `googlechrome://` deep link
 * first (more reliable there) and fall back to the intent URL.
 */
export function openInChromeAndroid(inApp: InAppBrowser, url = currentUrl()): void {
  const l = loc();
  if (!l) return;
  if (inApp === 'instagram') {
    // googlechrome://navigate?url= is more reliable from Instagram's webview.
    const gc = `googlechrome://navigate?url=${encodeURIComponent(url)}`;
    window.location.href = gc;
    // If the deep link didn't take us anywhere, fall back to the intent URL.
    window.setTimeout(() => { window.location.href = buildChromeIntentUrl(url); }, 500);
    return;
  }
  window.location.href = buildChromeIntentUrl(url);
}

// ---------------------------------------------------------------------------
// iOS: escape a webview into Safari (the only iOS browser that installs).
// ---------------------------------------------------------------------------

/**
 * Force-open the current URL in Safari via the `x-safari-https://` scheme.
 * Works on iOS 17/18+, NOT on iOS 16 — callers should also render manual
 * "⋯ → Open in Safari" instructions as the guaranteed fallback.
 */
export function openInSafari(url = currentUrl()): void {
  if (typeof window === 'undefined') return;
  const httpsStripped = url.replace(/^https?:\/\//, '');
  window.location.href = `x-safari-https://${httpsStripped}`;
}

// ---------------------------------------------------------------------------
// Logged-in hand-off (existing, preserved): mint a one-time token so the
// installed icon / escaped browser opens already signed in.
// ---------------------------------------------------------------------------

/**
 * Ask the server for a one-time hand-off token and return the URL that carries
 * it, so the destination (installed app or escaped browser) lands logged in.
 * Falls back to the plain /app guide URL if the mint fails.
 */
export async function mintHandoffUrl(): Promise<string> {
  try {
    const res = await fetch('/api/install/handoff', { method: 'POST' });
    if (res.ok) {
      const { url } = (await res.json()) as { url?: string };
      if (url) return url;
    }
  } catch {
    /* fall through */
  }
  return '/app';
}

// ---------------------------------------------------------------------------
// Escape orchestrator — pick the right escape for the detected environment.
// ---------------------------------------------------------------------------

export function escapeInAppBrowser(env: InstallEnvironment, url = currentUrl()): void {
  if (env.platform === 'android') {
    openInChromeAndroid(env.inApp, url);
  } else if (env.platform === 'ios' || env.platform === 'ipados') {
    openInSafari(url);
  }
  // Other platforms: nothing to do — the manual instruction UI handles it.
}

// ---------------------------------------------------------------------------
// iOS: the real app. One tap, from anywhere.
// ---------------------------------------------------------------------------

/**
 * Send an iPhone/iPad to CareerRai on the App Store.
 *
 * `location.href` rather than `window.open`: apps.apple.com is a universal
 * link, so a same-tab navigation is what makes iOS hand off to the App Store
 * app — and unlike `window.open` it is never eaten by a popup blocker or by
 * the Instagram/WhatsApp webviews, which are exactly the contexts where the
 * old Add-to-Home-Screen route was hopeless.
 */
export function openAppStore(url: string = APP_STORE_URL): void {
  if (!loc()) return;
  window.location.href = url;
}
