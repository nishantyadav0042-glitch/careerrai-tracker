// One call to turn on push: request OS permission, subscribe, and persist to the
// server. Returns a precise outcome so the UI can react (guide to Settings on a
// hard denial, tell iPhone-in-browser users to install first). Never throws.
export type EnablePushResult = 'granted' | 'denied' | 'ios_needs_install' | 'unsupported' | 'error';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

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
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
      });
    }

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return res.ok ? 'granted' : 'error';
  } catch {
    return 'error';
  }
}
