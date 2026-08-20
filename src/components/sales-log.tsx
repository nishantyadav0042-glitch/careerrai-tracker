'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';

// Keys are the API's disposition vocabulary (lib/sales-disposition
// CALL_OUTCOMES) — 'callback', not the stored 'follow_up'. The original
// component sent the stored-status vocabulary under the wrong body key
// ('status' instead of 'outcome'), so every save was silently rejected with
// a 400 while the UI showed "Call logged ✓".
const OUTCOMES: { key: string; label: string; cls: string }[] = [
  { key: 'interested', label: 'Interested', cls: 'bg-amber-500 text-white' },
  { key: 'callback', label: 'Callback', cls: 'bg-sky-600 text-white' },
  { key: 'converted', label: 'Converted', cls: 'bg-emerald-600 text-white' },
  { key: 'no_answer', label: 'No answer', cls: 'bg-stone-200 text-stone-700' },
  { key: 'not_interested', label: 'Not interested', cls: 'bg-stone-200 text-stone-700' },
];

function defaultCallback(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + (5.5 * 60 + now.getTimezoneOffset()) * 60_000);
  ist.setHours(18, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${ist.getFullYear()}-${p(ist.getMonth() + 1)}-${p(ist.getDate())}T18:00`;
}

// Standalone call-logger for the conversion page — outcome + feedback + callback.
export function QuickLog({ studentId }: { studentId: string }) {
  const [status, setStatus] = useState('interested');
  const [note, setNote] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsCallback = status === 'callback';

  // "Call logged ✓" is shown only after the server confirms the write —
  // never optimistically (20 Aug, Sales Phase 1).
  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/sales/log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, outcome: status, note, callbackAt: needsCallback ? (callbackAt || defaultCallback()) : null }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok === true) setSaved(true);
      else setError(json?.error ?? 'Could not save the call — try again.');
    } catch {
      setError('Connection issue — try again.');
    } finally { setSaving(false); }
  }

  if (saved) {
    return <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-semibold text-emerald-800">Call logged ✓ — it&apos;s in this student&apos;s history.</div>;
  }

  return (
    <div className="space-y-2.5 rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Log this call</p>
      <div className="flex flex-wrap gap-1.5">
        {OUTCOMES.map((o) => (
          <button key={o.key} onClick={() => setStatus(o.key)}
            className={`rounded-full px-3 py-1 text-[12px] font-bold ${status === o.key ? o.cls : 'bg-white text-stone-500 border border-stone-200'}`}>
            {o.label}
          </button>
        ))}
      </div>
      {needsCallback && (
        <div>
          <label className="text-[11px] font-semibold text-stone-500">Call back at (the time they said)</label>
          <input type="datetime-local" value={callbackAt || defaultCallback()} onChange={(e) => setCallbackAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
        </div>
      )}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What did they say? Objections, next step…"
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
      {error && <p className="text-[12px] font-semibold text-rose-600">{error}</p>}
      <button onClick={save} disabled={saving}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 py-2.5 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60">
        {saving ? 'Saving…' : <><Check className="h-4 w-4" /> Save this call</>}
      </button>
    </div>
  );
}
