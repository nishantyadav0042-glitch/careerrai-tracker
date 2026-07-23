'use client';

import { useState } from 'react';
import { Shield } from 'lucide-react';

// Snapchat-style manual streak restore. Shown on Home when the streak has
// broken and the student still holds a shield. THEY tap to restore — never
// automatic. Spends one shield via /api/streak/restore, then reloads so every
// surface reflects the restored streak.
export function StreakRestoreButton({ streak, shields }: { streak: number; shields: number }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/streak/restore', { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? 'Could not restore — try again.');
        return;
      }
      navigator.vibrate?.(40);
      window.location.reload();
    } catch {
      setErr('Could not restore — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-3">
      <div className="flex items-start gap-2">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-orange-900">Your {streak}-day streak broke 💔</p>
          <p className="mt-0.5 text-[11px] text-orange-700">
            Bring it back with a shield — you have <b>{shields}</b> left. Then log today to keep it going.
          </p>
        </div>
      </div>
      <button
        onClick={restore}
        disabled={busy}
        className="mt-2.5 w-full rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? 'Restoring…' : `🛡️ Restore my ${streak}-day streak`}
      </button>
      {err && <p className="mt-1.5 text-center text-[11px] text-rose-600">{err}</p>}
    </div>
  );
}
