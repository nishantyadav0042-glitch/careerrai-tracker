'use client';
import { useState } from 'react';
import { MessageCircle, PhoneCall, ChevronDown, Check } from 'lucide-react';
import type { LeadRow } from '@/lib/sales-queue';

const TIER: Record<string, string> = {
  hot: 'bg-rose-50 text-rose-700', warm: 'bg-amber-50 text-amber-800', cool: 'bg-stone-100 text-stone-500',
};
const STATUS_LABEL: Record<string, string> = {
  called: 'Called', interested: 'Interested', follow_up: 'Follow-up', converted: 'Converted ✓',
  not_interested: 'Not interested', no_answer: 'No answer', not_contacted: 'New',
};
const OUTCOMES: { key: string; label: string; cls: string }[] = [
  { key: 'interested', label: 'Interested', cls: 'bg-amber-500 text-white' },
  { key: 'follow_up', label: 'Callback', cls: 'bg-sky-600 text-white' },
  { key: 'converted', label: 'Converted', cls: 'bg-emerald-600 text-white' },
  { key: 'no_answer', label: 'No answer', cls: 'bg-stone-200 text-stone-700' },
  { key: 'not_interested', label: 'Not interested', cls: 'bg-stone-200 text-stone-700' },
];

// Default the callback field to "today 6 PM" IST — the founder's prime window.
function defaultCallback(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + (5.5 * 60 + now.getTimezoneOffset()) * 60_000);
  ist.setHours(18, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${ist.getFullYear()}-${p(ist.getMonth() + 1)}-${p(ist.getDate())}T18:00`;
}

export function SalesWorkspace({ cards, removeOnSave = false }: { cards: LeadRow[]; removeOnSave?: boolean }) {
  const [list, setList] = useState(cards);
  const [openId, setOpenId] = useState<string | null>(null);

  const onSaved = (id: string, status: string) => {
    if (removeOnSave) setList((l) => l.filter((c) => c.studentId !== id));
    else setList((l) => l.map((c) => (c.studentId === id ? { ...c, status } : c)));
    setOpenId(null);
  };

  if (list.length === 0) {
    return <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">Nothing here right now.</div>;
  }

  return (
    <div className="space-y-3">
      {list.map((c) => (
        <div key={c.studentId} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between">
              <a href={`/admin/student/${c.studentId}`} className="text-[15px] font-bold text-stone-900 hover:underline">{c.name}</a>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-extrabold text-stone-900">{c.convScore}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TIER[c.tier]}`}>{c.tier.toUpperCase()}</span>
              </div>
            </div>
            <p className="mt-0.5 text-xs text-stone-500">{c.phone ?? 'no phone'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {c.status && c.status !== 'not_contacted' && (
                <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">{STATUS_LABEL[c.status] ?? c.status}</span>
              )}
              {c.why.map((w, i) => <span key={i} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10.5px] font-medium text-stone-600">{w}</span>)}
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10.5px] text-stone-500">{c.lastActivity}</span>
            </div>
          </div>
          <div className="px-4 pb-2 pt-2">
            <div className="rounded-xl bg-stone-50 p-3 text-[13px] leading-relaxed text-stone-800">{c.script}</div>
          </div>
          <div className="flex items-stretch gap-px bg-stone-100">
            {c.waNumber ? (
              <a href={`https://wa.me/${c.waNumber}?text=${encodeURIComponent(c.script)}`} target="_blank" rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 bg-[#25d366] py-3 text-[13px] font-bold text-[#04331c] active:scale-95">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            ) : <span className="flex flex-1 items-center justify-center bg-stone-200 py-3 text-[12px] text-stone-500">no phone</span>}
            {c.phone && (
              <a href={`tel:${c.phone}`} className="flex items-center justify-center gap-1 bg-white px-3 py-3 text-[12px] font-semibold text-stone-700 active:bg-stone-50">
                <PhoneCall className="h-4 w-4" /> Call
              </a>
            )}
            <button onClick={() => setOpenId(openId === c.studentId ? null : c.studentId)}
              className="flex items-center justify-center gap-1 bg-white px-3 py-3 text-[12px] font-bold text-teal-700 active:bg-teal-50">
              Log <ChevronDown className={`h-4 w-4 transition-transform ${openId === c.studentId ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {openId === c.studentId && <LogPanel card={c} onSaved={onSaved} />}
        </div>
      ))}
    </div>
  );
}

function LogPanel({ card, onSaved }: { card: LeadRow; onSaved: (id: string, status: string) => void }) {
  const [status, setStatus] = useState<string>('interested');
  const [note, setNote] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [saving, setSaving] = useState(false);
  const needsCallback = status === 'follow_up';

  async function save() {
    setSaving(true);
    try {
      await fetch('/api/sales/log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: card.studentId, status, note, callbackAt: needsCallback ? (callbackAt || defaultCallback()) : null }),
      });
      onSaved(card.studentId, status);
    } catch { setSaving(false); }
  }

  return (
    <div className="space-y-2.5 border-t border-stone-100 bg-stone-50 px-4 py-3">
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
          <label className="text-[11px] font-semibold text-stone-500">Call back at (student busy? set the time they said)</label>
          <input type="datetime-local" value={callbackAt || defaultCallback()} onChange={(e) => setCallbackAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
        </div>
      )}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Feedback / what they said…"
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
      <button onClick={save} disabled={saving}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 py-2.5 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60">
        {saving ? 'Saving…' : <><Check className="h-4 w-4" /> Save this call</>}
      </button>
    </div>
  );
}
