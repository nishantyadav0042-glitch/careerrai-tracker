'use client';

import { useState } from 'react';
import { Flag, X, ShieldOff } from 'lucide-react';
import { CHAT_REPORT_REASONS, MAX_REPORT_NOTE, type ChatReportReason } from '@/lib/chat-safety';

// The report/block control for a 1:1 chat. Required by App Store Guideline 1.2
// and Play's UGC policy — an app with user-generated content must let a person
// report offensive content AND block the person sending it.
//
// Placed in the thread header rather than per-message: the thing you report in a
// 1:1 conversation is the person, not one line. It stays deliberately quiet — a
// small outline flag, not a red button — because the overwhelming majority of
// these conversations are a student and their mentor doing good work, and this
// surface should not imply otherwise.

export function ReportConversation({ otherId, otherName }: { otherId: string; otherName: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ChatReportReason | null>(null);
  const [note, setNote] = useState('');
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { blocked: boolean }>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/chat/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherId, reason, note: note.trim() || undefined, block }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'Could not send that report.'); setBusy(false); return; }
      setDone({ blocked: json.blocked === true });
    } catch {
      setError('Network error — please try again.');
    }
    setBusy(false);
  }

  function close() {
    setOpen(false);
    // Reset only after a completed report, so an accidental dismiss mid-form
    // doesn't silently lose what was typed.
    if (done) { setDone(null); setReason(null); setNote(''); setBlock(false); }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report or block this conversation"
        className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
      >
        <Flag className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <div className="flex items-start justify-between">
              <h2 className="text-[15px] font-bold text-stone-900">
                {done ? 'Thanks — we’ve got it' : `Report ${otherName}`}
              </h2>
              <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1 text-stone-400 hover:bg-stone-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {done ? (
              <div className="mt-2 space-y-3">
                <p className="text-[13px] leading-relaxed text-stone-600">
                  Our team reviews every report. {done.blocked
                    ? 'This conversation is now blocked — neither of you can send messages in it.'
                    : 'You have not blocked anyone, so the conversation stays open.'}
                </p>
                <p className="text-[12px] text-stone-500">
                  If you need this handled urgently, email{' '}
                  <a href="mailto:business@careerrai.com" className="font-semibold text-indigo-600">business@careerrai.com</a>.
                </p>
                <button type="button" onClick={close} className="w-full rounded-xl bg-stone-900 py-2.5 text-[13px] font-bold text-white">
                  Done
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <fieldset>
                  <legend className="text-[11px] font-bold uppercase tracking-wider text-stone-400">What happened?</legend>
                  <div className="mt-1.5 space-y-1">
                    {CHAT_REPORT_REASONS.map((r) => (
                      <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-stone-800 hover:bg-stone-50">
                        <input
                          type="radio" name="chat-report-reason" value={r.id}
                          checked={reason === r.id}
                          onChange={() => setReason(r.id)}
                          className="h-4 w-4 accent-indigo-600"
                        />
                        {r.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Anything else? (optional)</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, MAX_REPORT_NOTE))}
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-[13px] text-stone-900"
                    placeholder="Tell us what you saw. Only our team reads this."
                  />
                </label>

                <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-stone-50 p-2.5">
                  <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="mt-0.5 h-4 w-4 accent-rose-600" />
                  <span className="text-[12.5px] leading-snug text-stone-700">
                    <span className="flex items-center gap-1 font-bold text-stone-900">
                      <ShieldOff className="h-3.5 w-3.5" /> Also block {otherName}
                    </span>
                    Stops messages in both directions straight away. Our team will sort out a replacement for you.
                  </span>
                </label>

                {error && <p className="text-[12px] font-semibold text-rose-600">{error}</p>}

                <button
                  type="button" onClick={() => void submit()} disabled={!reason || busy}
                  className="w-full rounded-xl bg-stone-900 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
                >
                  {busy ? 'Sending…' : block ? 'Report and block' : 'Send report'}
                </button>
                <p className="text-[11px] leading-snug text-stone-400">
                  Reports are private. The other person is never told who reported them.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
