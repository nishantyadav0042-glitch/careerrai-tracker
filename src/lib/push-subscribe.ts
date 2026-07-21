// One call to turn on push: request OS permission, subscribe, and persist to the
// server. Returns a precise outcome so the UI can react (guide to Settings on a
// hard denial, tell iPhone-in-browser users to install first). Never throws.
import { track } from '@/lib/journey';
import { getLiveSubscription, persistSubscription } from '@/lib/push-client';

export type EnablePushResult = 'granted' | 'denied' | 'ios_needs_install' | 'unsupported' | 'error';

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}

export async function enablePush(): Promise<EnablePushResult> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      // iPhone Safari: push only exists once installed to the Home Screen.
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !isStandalone()) return 'ios_needs_install';
      return 'unsupported';
    }
    // iOS in a browser tab cannot receive push until the PWA is installed.
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !isStandalone()) return 'ios_needs_install';

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
    if (!keyRes.ok) return 'error';
    const { key } = await keyRes.json();
    if (!key) return 'error';

    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;
    // Reuse a healthy sub (this path already never rotated); persist with retry.
    const sub = await getLiveSubscription(reg, key);

    const context = isStandalone() ? 'standalone' : 'browser';
    const ok = await persistSubscription(sub, context);
    if (ok) {
      // Record WHERE push was granted — a browser-context grant is the tell for
      // a subscription that usually can't deliver.
      track('push_enabled', { context, deliverable: context === 'standalone' });
    }
    return ok ? 'granted' : 'error';
  } catch {
    return 'error';
  }
}
