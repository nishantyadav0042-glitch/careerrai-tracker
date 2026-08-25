'use client';

import { useState } from 'react';

// Client-side actions for a Log Breaker row. Copy puts the draft on the
// clipboard AND offers the wa.me deep link when a phone exists — the founder
// sends by hand, always. Mark-contacted records the interview outcome on the
// student's timeline through /api/admin/log-breakers.

export function CopyDraftButton({ draft, phone }: { draft: string; phone: string | null }) {
  const [copied, setCopied] = useState(false);
  const wa = phone ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(draft)}` : null;
  return (
    <span className="flex gap-2">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(draft).then(() => {
            setCopied(true); setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-semibold text-white active:scale-95"
      >
        {copied ? 'Copied ✓' : 'Copy WhatsApp draft'}
      </button>
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer"
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-800">
          Open WhatsApp →
        </a>
      )}
    </span>
  );
}

export function MarkContactedButton({ studentId }: { studentId: string }) {
  const [state, setState] = useState<'idle' | 'asking' | 'saving' | 'done' | 'error'>('idle');
  const [note, setNote] = useState('');

  if (state === 'done') {
    return <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-[12px] font-bold text-emerald-700">Recorded ✓ (refresh to see)</span>;
  }
  if (state === 'idle') {
    return (
      <button type="button" onClick={() => setState('asking')}
        className="rounded-lg border border-stone-200 px-3 py-1.5 text-[12px] font-semibold text-stone-600 active:scale-95">
        Mark contacted
      </button>
    );
  }
  return (
    <span className="flex flex-1 basis-full gap-2 pt-1">
      <input
        autoFocus value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="What did they say? (one line — becomes the record)"
        className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[12px]"
      />
      <button
        type="button" disabled={state === 'saving'}
        onClick={() => {
          setState('saving');
          void fetch('/api/admin/log-breakers', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ studentId, note }),
          }).then((r) => setState(r.ok ? 'done' : 'error'))
            .catch(() => setState('error'));
        }}
        className="rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
      >
        {state === 'saving' ? 'Saving…' : state === 'error' ? 'Retry' : 'Save'}
      </button>
    </span>
  );
}
