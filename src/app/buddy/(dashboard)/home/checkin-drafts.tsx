'use client';

import { useState } from 'react';
import { Send, X, Pencil, Check } from 'lucide-react';

// The mentor's one-tap check-in.
//
// Everything here is shaped by one rule: this must feel like the mentor
// noticing, not like approving a system notification. So the card leads with
// the FACT ("Rahul — 2 days, no log"), the message is fully editable before it
// goes, and after sending it says "sent from your account" — because that is
// literally what happened.

export interface CheckInDraftItem {
  id: string;
  studentId: string;
  studentName: string;
  body: string;
  missedDays: number;
  /** Human-readable one-liner of why this student surfaced. */
  because: string;
}

export function CheckInDrafts({ drafts }: { drafts: CheckInDraftItem[] }) {
  const [items, setItems] = useState(drafts);
  const [editing, setEditing] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>(
    Object.fromEntries(drafts.map((d) => [d.id, d.body]))
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [error, setError] = useState<Record<string, string>>({});

  if (!items.length) return null;

  async function act(draft: CheckInDraftItem, action: 'send' | 'dismiss') {
    setBusy(draft.id);
    setError((e) => ({ ...e, [draft.id]: '' }));
    try {
      const res = await fetch('/api/buddy/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: draft.id, action, body: bodies[draft.id] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((e) => ({ ...e, [draft.id]: json.message ?? json.error ?? 'Could not send' }));
        return;
      }
      if (action === 'send') setSent((s) => ({ ...s, [draft.id]: draft.studentName }));
      else setItems((list) => list.filter((d) => d.id !== draft.id));
    } catch {
      setError((e) => ({ ...e, [draft.id]: 'Network problem — try again' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2 px-1">
        Check in on them
      </p>
      <div className="space-y-3">
        {items.map((d) => {
          const isSent = !!sent[d.id];
          return (
            <div
              key={d.id}
              className={`rounded-xl border p-4 ${
                isSent ? 'border-teal-200 bg-teal-50' : 'border-amber-200 bg-amber-50'
              }`}
            >
              {isSent ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-teal-900">
                  <Check className="h-4 w-4 shrink-0" />
                  Sent to {d.studentName} from your account
                </p>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-amber-900">
                        {d.studentName} — {d.missedDays} days, no log
                      </p>
                      <p className="mt-0.5 text-xs text-amber-800">{d.because}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void act(d, 'dismiss')}
                      disabled={busy === d.id}
                      aria-label={`Skip check-in for ${d.studentName}`}
                      title="Skip — I'll reach out my own way"
                      className="shrink-0 rounded-lg p-1.5 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {editing === d.id ? (
                    <textarea
                      value={bodies[d.id]}
                      onChange={(e) => setBodies((b) => ({ ...b, [d.id]: e.target.value }))}
                      rows={4}
                      maxLength={2000}
                      className="mt-3 w-full rounded-lg border border-amber-300 bg-white p-3 text-sm leading-relaxed text-stone-800 focus:border-amber-500 focus:outline-none"
                    />
                  ) : (
                    <p className="mt-3 rounded-lg bg-white p-3 text-sm leading-relaxed text-stone-800">
                      {bodies[d.id]}
                    </p>
                  )}

                  {error[d.id] && (
                    <p className="mt-2 text-xs font-medium text-red-700">{error[d.id]}</p>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void act(d, 'send')}
                      disabled={busy === d.id || !bodies[d.id]?.trim()}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                      {busy === d.id ? 'Sending…' : 'Send as me'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(editing === d.id ? null : d.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
                    >
                      <Pencil className="h-4 w-4" />
                      {editing === d.id ? 'Done' : 'Edit'}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-xs text-stone-500">
        Goes into your chat with them, from your account. They can reply — and you&apos;ll see it.
      </p>
    </section>
  );
}
