'use client';

import { useState } from 'react';
import { Shield } from 'lucide-react';

// One-tap Momentum Shield announcement. Idempotent server-side (a student is
// never messaged twice), so re-tapping is always safe.
export function StreakRestoreBroadcastButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function fire() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/streak-restore-broadcast', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setResult(`Done — ${json.inApp} in-app notifications, ${json.pushed} pushes delivered${json.skipped ? `, ${json.skipped} already sent earlier` : ''}.`);
      } else {
        setResult(json.error ?? 'Failed — try again.');
      }
    } catch {
      setResult('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={fire}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-60"
      >
        <Shield className="h-4 w-4" />
        {busy ? 'Sending…' : 'Announce restored streaks to all students'}
      </button>
      {result && <p className="mt-2 text-xs font-medium text-stone-600">{result}</p>}
    </div>
  );
}
