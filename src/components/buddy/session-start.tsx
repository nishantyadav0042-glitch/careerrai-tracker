'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Radio } from 'lucide-react';

// ── The mentor's Start ──────────────────────────────────────────────────────
//
// The missing half of the single-session product. Sixteen sessions were sold and none
// was ever completed, because `active` was an unreachable state: legal in the
// schema since the table was created, never written by any code. This button
// is the only thing in the product that can write it.
//
// The mentor presses it when the call actually begins. Not the student opening
// a link — the mentor may never arrive, and `active` would then be a promise
// the product made on a human's behalf.
//
// started_at is NOT sent from here. The database stamps it in the same
// statement that changes the state, so a client clock (or a mentor pressing
// Start an hour late) can never decide when a call began.

export function SessionStart({ sessionId, status, startedAt }: {
  sessionId: string;
  status: string;
  startedAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'active') {
    // A malformed timestamp must degrade to "Live", never to the literal
    // string "Invalid Date" sitting on a mentor's screen mid-call.
    const parsed = startedAt ? new Date(startedAt) : null;
    const at = parsed && !Number.isNaN(parsed.getTime())
      ? parsed.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit',
      })
      : null;
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-[13px] font-bold text-white">
        <Radio className="h-3.5 w-3.5 animate-pulse" />
        {at ? `Live since ${at}` : 'Live'}
      </span>
    );
  }

  if (status !== 'scheduled') return null;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json().catch(() => null);
      // alreadyStarted is a SUCCESS: a second tap, or two tabs open, must not
      // read as a failure to the mentor — the session is running either way.
      if (res.ok && json?.ok === true) {
        router.refresh();
      } else {
        setError(json?.error ?? 'Could not start the session — try again.');
      }
    } catch {
      setError('Connection issue — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        onClick={start}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-[14px] font-extrabold text-teal-700 active:scale-[0.98] disabled:opacity-60"
      >
        <Play className="h-3.5 w-3.5" />
        {busy ? 'Starting…' : 'Start'}
      </button>
      {error && <p className="max-w-[180px] text-right text-[10px] font-semibold text-rose-100">{error}</p>}
    </div>
  );
}
