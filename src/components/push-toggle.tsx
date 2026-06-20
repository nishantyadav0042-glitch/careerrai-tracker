'use client';
import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';

// Web Push requires the applicationServerKey as a Uint8Array. Passing the raw
// base64url string works in some Chrome builds but throws in others — and any
// stray whitespace (easy to introduce when pasting the key into env settings)
// makes subscribe() reject. Decoding here is the reliable, cross-browser path.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const clean = base64String.trim();
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function PushToggle({
  initialEnabled,
  vapidKey,
}: {
  initialEnabled: boolean;
  vapidKey?: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefer the server-provided key (read at request time so it survives env
  // changes without a rebuild); fall back to the build-time inlined value.
  const publicKey = vapidKey || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(ok);
    if (ok) setDenied(Notification.permission === 'denied');
  }, []);

  if (!supported) {
    return (
      <p className="text-xs text-stone-400">
        Push notifications aren&apos;t supported in this browser. On iPhone, add this app to your
        Home Screen first, then enable alerts from there.
      </p>
    );
  }

  async function toggle() {
    if (denied) return;
    setLoading(true);
    setError(null);
    try {
      if (!enabled) {
        if (!publicKey) {
          setError('Push isn’t configured on the server yet. Please try again later.');
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'denied') {
          setDenied(true);
          return;
        }
        if (permission !== 'granted') return; // dismissed — leave it off, no error

        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        const existing = await reg.pushManager.getSubscription();
        const sub =
          existing ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          }));

        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub),
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        setEnabled(true);
      } else {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        const sub = await reg?.pushManager.getSubscription();
        await sub?.unsubscribe();
        await fetch('/api/push/subscribe', { method: 'DELETE' });
        setEnabled(false);
      }
    } catch (err) {
      console.error('Push toggle failed:', err);
      setError(
        err instanceof Error ? `Couldn’t enable push: ${err.message}` : 'Couldn’t enable push alerts.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {enabled ? (
            <Bell className="w-4 h-4 text-teal-700 shrink-0" />
          ) : (
            <BellOff className="w-4 h-4 text-stone-400 shrink-0" />
          )}
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
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
