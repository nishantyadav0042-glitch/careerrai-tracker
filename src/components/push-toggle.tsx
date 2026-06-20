'use client';
import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';

export function PushToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(ok);
    if (ok) setDenied(Notification.permission === 'denied');
  }, []);

  if (!supported) return null;

  async function toggle() {
    if (denied) return;
    setLoading(true);
    try {
      if (!enabled) {
        const permission = await Notification.requestPermission();
        if (permission === 'denied') {
          setDenied(true);
          return;
        }
        if (permission !== 'granted') return;

        const reg = await navigator.serviceWorker.register('/sw.js');
        const existing = await reg.pushManager.getSubscription();
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) throw new Error('Push not configured');
        const sub = existing ?? await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub),
        });
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
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {enabled ? <Bell className="w-4 h-4 text-teal-700 shrink-0" /> : <BellOff className="w-4 h-4 text-stone-400 shrink-0" />}
        <div className="min-w-0">
          <span className="text-sm font-medium text-stone-800">Browser push alerts</span>
          {denied && (
            <p className="text-xs text-stone-400 mt-0.5">Blocked in browser settings — tap the lock icon in your address bar to allow.</p>
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
  );
}
