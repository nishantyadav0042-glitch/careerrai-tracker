'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Set a mentor's meeting room from the Buddy 360. When a mentor has students and
// no room they literally cannot book a session — the top mentor fault — and this
// is where the founder clears it without asking the mentor to do anything.
export function SetRoom({ buddyId, hasRoom }: { buddyId: string; hasRoom: boolean }) {
  const router = useRouter();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(!hasRoom);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/set-buddy-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buddy_id: buddyId, link }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setLink('');
        router.refresh();
      } else {
        setErr(body.error ?? `Failed (${res.status})`);
      }
    } catch {
      setErr('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  if (hasRoom && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-[11px] font-semibold text-stone-500 underline">
        Replace meeting room
      </button>
    );
  }

  return (
    <div className={`mt-3 rounded-2xl border p-3.5 ${hasRoom ? 'border-stone-200 bg-white' : 'border-red-300 bg-red-50'}`}>
      <p className={`text-[12px] font-bold ${hasRoom ? 'text-stone-700' : 'text-red-800'}`}>
        {hasRoom ? 'Replace the legacy meeting room' : 'No legacy meeting room on file'}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://meet.google.com/xxx-xxxx-xxx"
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-2 font-mono text-[12px] text-stone-800"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !link}
          className="rounded-lg bg-stone-900 px-3 py-2 text-[12px] font-bold text-white active:scale-95 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Set room'}
        </button>
      </div>
      {err && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">{err}</p>}
    </div>
  );
}
