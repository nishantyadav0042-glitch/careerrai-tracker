'use client';
import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';

export function PushToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window);
  }, []);

  if (!supported) return null;

  async function toggle() {
    setLoading(true);
    try {
      if (!enabled) {
        // Subscribe
        const reg = await navigator.serviceWorker.register('/sw.js');
        const existing = await reg.pushManager.getSubscription();
        const sub = existing ?? await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub),
        });
        setEnabled(true);
      } else {
        // Unsubscribe
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        const sub = await reg?.pushManager.getSubscription();
        await sub?.unsubscribe();
        await fetch('/api/push/subscribe', { method: 'DELETE' });
        setEnabled(false);
      }
    } catch {
      console.error('Push toggle failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {enabled ? <Bell className="w-4 h-4 text-teal-700" /> : <BellOff className="w-4 h-4 text-stone-400" />}
        <span className="text-sm font-medium text-stone-800">Browser push alerts</span>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-teal-700' : 'bg-stone-300'} disabled:opacity-50`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}
