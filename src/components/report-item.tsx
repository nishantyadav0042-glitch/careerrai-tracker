'use client';

import { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { track } from '@/lib/journey';

// The Play-UGC-required report control — deliberately quiet (a small flag,
// not a red button) so it's findable without inviting casual use. One tap →
// four reasons → done. The item disappears for this student immediately
// (their report is honoured in their own view), and at 3 distinct reports
// it's pulled from everyone's pool pending founder review.
const REASONS = [
  { id: 'wrong_or_misleading', label: 'Wrong or misleading' },
  { id: 'abusive', label: 'Abusive or inappropriate' },
  { id: 'spam_or_ad', label: 'Spam or advertisement' },
  { id: 'not_cat', label: 'Not related to CAT' },
] as const;

export function ReportItem({ submissionId, onReported }: { submissionId: string; onReported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // A failed report used to do NOTHING — no message, sheet open, button
  // re-enabled. A safety report the platform is required to accept cannot
  // vanish without a word.
  const [error, setError] = useState<string | null>(null);

  async function report(reason: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/community/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId, reason }),
      });
      if (res.ok) {
        track('content_reported', { reason });
        setDone(true);
        onReported?.();
      } else {
        setError('Couldn’t send the report — tap the reason again.');
      }
    } catch { setError('Couldn’t send the report — tap the reason again.'); }
    setBusy(false);
  }

  if (done) {
    return <span className="text-[10px] font-semibold text-stone-400">Reported — thank you, we&apos;ll review it.</span>;
  }

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        aria-label="Report this"
        className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-stone-300 active:text-stone-500"
      >
        <Flag className="h-2.5 w-2.5" /> Report
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-bold text-stone-900">What&apos;s wrong with this?</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-stone-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            {error && <p className="mt-1 text-[11.5px] font-semibold text-rose-600">{error}</p>}
            <div className="mt-3 space-y-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.id} type="button" disabled={busy}
                  onClick={() => void report(r.id)}
                  className="w-full rounded-xl bg-stone-100 py-2.5 text-[13px] font-semibold text-stone-700 active:scale-[0.99] disabled:opacity-50"
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-[10px] text-stone-400">
              Reports are private. Repeated reports remove the item until we review it.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
