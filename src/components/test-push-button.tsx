'use client';

import { useState } from 'react';
import { BellRing } from 'lucide-react';

// One-tap end-to-end push check for the founder: subscription → server → FCM →
// service worker → lock screen. Surfaces the exact failure reason so "I got
// nothing" becomes diagnosable (no subscription / VAPID / send failed) instead
// of a mystery.
export function TestPushButton() {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; message?: string };
      if (res.ok && data.ok) {
        setStatus({ ok: true, text: 'Sent ✅ — close the app and check your lock screen. If nothing lands in ~30s, it’s Android battery optimization (set Chrome/CareerRai to “Unrestricted”).' });
      } else {
        const reason = data.reason ? ` (${data.reason})` : '';
        setStatus({ ok: false, text: `${data.message || 'Could not send'}${reason}` });
      }
    } catch {
      setStatus({ ok: false, text: 'Network error — try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
      >
        <BellRing className="h-4 w-4" />
        {busy ? 'Sending…' : 'Send myself a test push'}
      </button>
      {status && (
        <p className={`mt-2 text-xs leading-relaxed ${status.ok ? 'text-green-700' : 'text-amber-700'}`}>{status.text}</p>
      )}
    </div>
  );
}
