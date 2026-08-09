'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// The one-click fix behind the "Captured but never unlocked" banner. It calls
// the admin retry-unlock API, which re-runs the (idempotent) premium grant for
// a payment already marked paid — never flipping payment state, so it can't be
// a signature bypass. On success the server component refreshes and the banner
// turns green; on failure it says so, and the founder calls the student.
export function RetryUnlock({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function retry() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/retry-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.premium) {
        setMsg({ ok: true, text: body.alreadyPremium ? 'Already premium — nothing to fix.' : 'Unlocked — premium is now active.' });
        router.refresh();
      } else {
        setMsg({ ok: false, text: body.error ?? 'Unlock did not complete — call the student.' });
      }
    } catch {
      setMsg({ ok: false, text: 'Network error — try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => void retry()}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-red-500 disabled:opacity-60"
      >
        {busy ? 'Retrying…' : 'Retry the unlock'}
      </button>
      {msg && <p className={`mt-1.5 text-[11.5px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
    </div>
  );
}
