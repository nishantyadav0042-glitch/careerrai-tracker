'use client';
import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';

// Web Push requires the applicationServerKey as a Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const clean = base64String.trim();
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

// The `vapidKey` prop is ignored on purpose: the public key is ALWAYS fetched
// from /api/push/vapid-public-key so it matches the private key the server signs
// with (both are DB-authoritative). Passing a build-time env key here caused a
// key mismatch that made every push silently fail.
export function PushToggle({ initialEnabled }: { initialEnabled: boolean; vapidKey?: string }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(true);
  const [denied, setDenied] = useState(false);
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- browser-capability detection must run client-side after mount */
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    // iOS only exposes the Push API to an INSTALLED PWA (Add to Home Screen).
    if (isIOS() && !isStandalone()) {
      setIosNeedsInstall(true);
      setSupported(false);
      return;
    }
    setSupported(ok);
    if (ok) setDenied(Notification.permission === 'denied');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (iosNeedsInstall) {
    return (
      <p className="text-xs text-stone-500">
        To get alerts on iPhone, first add CareerRai to your Home Screen (Share → Add to Home Screen),
        open it from there, then turn alerts on.
      </p>
    );
  }
  if (!supported) {
    return <p className="text-xs text-stone-400">Push notifications aren&apos;t supported in this browser.</p>;
  }

  async function enablePush() {
    // 1. Permission
    const permission = await Notification.requestPermission();
    if (permission === 'denied') { setDenied(true); return; }
    if (permission !== 'granted') return; // dismissed — leave off, no error

    // 2. The public key — from the server (DB) so it matches the signing key.
    const keyRes = await fetch('/api/push/vapid-public-key');
    if (!keyRes.ok) { setError('Push isn’t configured on the server yet.'); return; }
    const { key: publicKey } = await keyRes.json();
    if (!publicKey) { setError('Push isn’t configured on the server yet.'); return; }

    // 3. Subscribe on the (globally-registered) service worker.
    await navigator.serviceWorker.register('/sw.js'); // no-op if already registered
    const reg = await navigator.serviceWorker.ready;
    // Drop any stale subscription that was bound to a different key.
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      try { await existing.unsubscribe(); } catch { /* ignore */ }
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // 4. Persist.
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    setEnabled(true);
  }

  async function disablePush() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
    await fetch('/api/push/subscribe', { method: 'DELETE' });
    setEnabled(false);
  }

  async function toggle() {
    if (denied) return;
    setLoading(true);
    setError(null);
    try {
      if (!enabled) await enablePush();
      else await disablePush();
    } catch (err) {
      console.error('Push toggle failed:', err);
      setError(err instanceof Error ? `Couldn’t enable push: ${err.message}` : 'Couldn’t enable push alerts.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {enabled ? <Bell className="w-4 h-4 text-teal-700 shrink-0" /> : <BellOff className="w-4 h-4 text-stone-400 shrink-0" />}
          <div className="min-w-0">
            <span className="text-sm font-medium text-stone-800">Browser push alerts</span>
            {denied && (
              <p className="text-xs text-stone-400 mt-0.5">
                Blocked in browser settings — tap the lock icon in your address bar to allow.
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={loading || denied}
          aria-label={enabled ? 'Disable push alerts' : 'Enable push alerts'}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-teal-700' : 'bg-stone-300'} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
