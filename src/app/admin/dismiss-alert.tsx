'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

// The close button on a sacred alert.
//
// Founder, 6 Sep 2026: "add a close button also here... so that I can tap
// already assigned or completed."
//
// TWO TAPS, NOT ONE, and deliberately so. A bare X would record "the founder
// closed this" without saying why, and three months from now the only honest
// answer to "why did that ₹999 alert stop firing" would be "someone tapped
// something". Naming the reason costs one tap and makes the row mean
// something — and it is the founder's own vocabulary, not ours.
//
// The X only OPENS the choice; nothing is written until a reason is picked, so
// a mis-tap on a small screen next to "Open payment" cannot silence a live
// money alert.
export function DismissAlert({ alertId, studentId }: { alertId: string; studentId?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = async (reason: 'assigned' | 'completed') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/dismiss-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, reason, studentId: studentId ?? '' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Never pretend it closed. A card that silently returns on the next
        // load reads as a broken button.
        setError(typeof data?.error === 'string' ? data.error : 'Could not close this. Try again.');
        return;
      }
      // The alert list is server-rendered, so refresh rather than hiding it
      // locally — what the founder sees next is what the database says.
      router.refresh();
    } catch {
      setError('Could not close this. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Close this alert"
        className="ml-auto shrink-0 rounded-lg p-1.5 text-stone-400 hover:bg-white/60 hover:text-stone-700"
      >
        <X className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="w-full">
      <p className="text-[11px] font-semibold text-stone-600">Close because…</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <button
          type="button" disabled={busy} onClick={() => close('assigned')}
          className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-[11.5px] font-bold text-stone-800 disabled:opacity-50"
        >
          Already assigned
        </button>
        <button
          type="button" disabled={busy} onClick={() => close('completed')}
          className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-[11.5px] font-bold text-stone-800 disabled:opacity-50"
        >
          Completed
        </button>
        <button
          type="button" disabled={busy} onClick={() => { setOpen(false); setError(null); }}
          className="rounded-lg px-2 py-1.5 text-[11.5px] font-semibold text-stone-500 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {busy && <p className="mt-1 text-[11px] text-stone-500">Closing…</p>}
      {error && <p className="mt-1 text-[11px] font-medium text-red-700">{error}</p>}
    </div>
  );
}
