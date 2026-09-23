'use client';

import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { track } from '@/lib/journey';

// Snapchat-style manual streak restore. Shown on Home when the streak has
// broken and the student still holds a shield. THEY tap to restore — never
// automatic. Spends one shield via /api/streak/restore, then reloads so every
// surface reflects the restored streak.
//
// ── INSTRUMENTED, NOT CHANGED (founder, 23 Sep) ─────────────────────────────
//
// Behaviour here is untouched. The three events below exist because the rest
// of this funnel is already derivable from the database and these three steps
// are not: `restored_dates` proves a completed restore, `shields < 3` proves a
// spend, and daily_reports proves what happened afterwards — but NOTHING
// anywhere records that a student was ever SHOWN this card, tapped it, or hit
// an error trying.
//
// That gap is why "321 students hold a broken streak and a shield and have not
// restored" cannot currently be read as a refusal. 321 have the opportunity;
// we do not know how many have seen it. Measured 23 Sep: 24 students have ever
// restored, out of 332 with a streak row.
//
// The question these three events exist to answer, and nothing more:
//   is the low uptake a demand problem or an exposure problem?
export function StreakRestoreButton({ streak, shields }: { streak: number; shields: number }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Fires once per mount. An IMPRESSION, never an act — the Truth Map's
  // categories are not interchangeable, and a student who was shown this card
  // has done nothing at all.
  useEffect(() => {
    track('restore_shown', { streak, shields });
  }, [streak, shields]);

  async function restore() {
    setBusy(true);
    setErr(null);
    // The ACT. Fired BEFORE the request, so a tap that never gets an answer —
    // dead network, closed tab — is still recorded as intent. Firing it on
    // success would make the failure cases invisible, which is the half of
    // this funnel we most need.
    track('restore_tapped', { streak, shields });
    try {
      const res = await fetch('/api/streak/restore', { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        track('restore_failed', { status: res.status, kind: 'http' });
        setErr((j as { error?: string }).error ?? 'Could not restore — try again.');
        return;
      }
      navigator.vibrate?.(40);
      window.location.reload();
    } catch {
      track('restore_failed', { status: 0, kind: 'network' });
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
