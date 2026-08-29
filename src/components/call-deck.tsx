'use client';
import { useState } from 'react';
import { MessageCircle, PhoneCall, PhoneOff, ChevronDown } from 'lucide-react';
import type { CallLead } from '@/lib/call-queue';

const TIER: Record<string, string> = { hot: 'bg-rose-50 text-rose-700', warm: 'bg-amber-50 text-amber-800', cool: 'bg-stone-100 text-stone-500' };
const DUE_CLS: Record<string, string> = {
  callback: 'bg-sky-600 text-white', retry: 'bg-orange-500 text-white', followup: 'bg-amber-500 text-white',
  going_cold: 'bg-rose-600 text-white', broken_streak: 'bg-violet-600 text-white',
  new_never_logged: 'bg-teal-600 text-white', conversion: 'bg-emerald-600 text-white',
  fresh: 'bg-stone-200 text-stone-600',
};
const OUTCOMES: { key: string; label: string; cls: string }[] = [
  { key: 'interested', label: 'Interested', cls: 'bg-amber-500 text-white' },
  { key: 'callback', label: 'Callback', cls: 'bg-sky-600 text-white' },
  // NOT "Converted" (Incident #52). A rep cannot know that money arrived — only
  // the payment ledger converts a student. Tapping this records strong buying
  // intent; if a payment exists the student is converted, and if it does not
  // they stay in the book and the founder gets an exception. The label says
  // what the rep can actually observe, so the button never lies to them.
  { key: 'converted', label: 'Ready to pay', cls: 'bg-emerald-600 text-white' },
  { key: 'not_interested', label: 'Not interested', cls: 'bg-stone-700 text-white' },
  // The student said stop calling. Closes the lead forever (dnd ≠ "no to the
  // offer" — it's "no to the contact"). Note is mandatory: record who said it.
  { key: 'dnd', label: 'Stop calling (DND)', cls: 'bg-rose-700 text-white' },
];

function defaultCallback(): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  ist.setUTCHours(18, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCDate())}T18:00`;
}

export function CallDeck({ queue }: { queue: CallLead[] }) {
  const [list, setList] = useState(queue);
  const [done, setDone] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  // NOT optimistic (20 Aug, Sales Phase 1): the lead leaves the deck only
  // after the server confirms the write. The old version removed the card
  // regardless — a rejected disposition looked identical to a saved one, and
  // the lead was gone from the rep's day with nothing recorded.
  const dispose = async (lead: CallLead, outcome: string, note: string, callbackAt?: string): Promise<boolean> => {
    setErrorById((e) => ({ ...e, [lead.studentId]: '' }));
    let failure = 'Could not save the call — check your connection and try again.';
    try {
      const res = await fetch('/api/sales/log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: lead.studentId, outcome, note, callbackAt, hot: lead.hot }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok === true) {
        setDone((d) => d + 1);
        setList((l) => l.filter((x) => x.studentId !== lead.studentId));
        setOpenId(null);
        return true;
      }
      if (json?.error) failure = json.error;
    } catch { /* network failure — fall through to the shared message */ }
    setErrorById((e) => ({ ...e, [lead.studentId]: failure }));
    return false;
  };

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="text-lg font-bold text-emerald-800">Queue cleared for now 👏</p>
        <p className="mt-1 text-sm text-emerald-700">{done} handled this session. New leads and callbacks roll in through the day — check back.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="px-1 text-center text-xs font-semibold text-stone-500">{done} handled this session · {list.length} in your queue</p>
      {list.map((lead) => (
        <div key={lead.studentId} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between gap-2">
              <a href={`/sales/student/${lead.studentId}`} className="truncate text-[15px] font-bold text-stone-900 hover:underline">{lead.name}</a>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${DUE_CLS[lead.dueReason]}`}>{lead.dueLabel}</span>
              {/* WHICH GOAL THIS CALL IS FOR (§4). The counsellor must know
                  before they open their mouth whether they are here to get a
                  student studying again or to talk about paying — opening with
                  the wrong one is the difference between help and a pitch. */}
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                lead.objective === 'conversion' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>
                {lead.objective}
                {lead.objectiveSecondary ? ` + ${lead.objectiveSecondary}` : ''}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-stone-500">{lead.phone ?? 'no phone'}</p>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${TIER[lead.tier]}`}>{lead.tier.toUpperCase()}</span>
              <span className="text-[11px] text-stone-400">momentum {lead.momentumScore}</span>
            </div>
            {/* WHY THIS STUDENT IS HERE (founder, 24 Aug): the lane's trigger
                with real numbers, then the recommended move. This block is
                what makes the card intelligence, not a phone list. */}
            <div className="mt-2 rounded-lg bg-stone-50 px-2.5 py-2">
              {lead.why.map((w, i) => (
                <p key={i} className="text-[12px] font-semibold leading-snug text-stone-700">{w}</p>
              ))}
              {/* WHAT WAS SAID LAST TIME. This is the whole reason the second
                  call is better than the first. It used to live one tap deeper
                  on the 360, which meant it was read when there was time and
                  skipped when there wasn't — and the student repeated
                  themselves to the same company twice. */}
              {lead.lastInteraction && (
                <div className="mt-1.5 rounded-lg bg-stone-100 px-2.5 py-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    Last time · {new Date(lead.lastInteraction.atIso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    {lead.lastInteraction.outcome ? ` · ${lead.lastInteraction.outcome.replace(/_/g, ' ')}` : ''}
                  </p>
                  {lead.lastInteraction.note && (
                    <p className="mt-0.5 text-[12px] font-semibold italic leading-snug text-stone-700">
                      &ldquo;{lead.lastInteraction.note}&rdquo;
                    </p>
                  )}
                </div>
              )}
              <p className="mt-1 text-[12px] font-bold text-teal-700">→ {lead.action}</p>
            </div>
            {/* The weakness brief — what she reads before dialing */}
            <ul className="mt-2 space-y-0.5">
              {lead.brief.map((b, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[12px] text-stone-600"><span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-stone-300" />{b}</li>
              ))}
            </ul>
          </div>
          <div className="mt-3 flex items-stretch gap-px bg-stone-100">
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="flex flex-1 items-center justify-center gap-1.5 bg-stone-900 py-3 text-[13px] font-bold text-white active:scale-95">
                <PhoneCall className="h-4 w-4" /> Call
              </a>
            )}
            {lead.waNumber && (
              <a href={`https://wa.me/${lead.waNumber}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 bg-[#25d366] px-3 py-3 text-[12px] font-bold text-[#04331c] active:scale-95">
                <MessageCircle className="h-4 w-4" /> WA
              </a>
            )}
            <button onClick={() => void dispose(lead, 'no_answer', '')} className="flex items-center justify-center gap-1 bg-white px-3 py-3 text-[12px] font-semibold text-orange-600 active:bg-orange-50" title="Didn't pick up">
              <PhoneOff className="h-4 w-4" /> No answer
            </button>
            <button onClick={() => setOpenId(openId === lead.studentId ? null : lead.studentId)} className="flex items-center justify-center gap-1 bg-white px-3 py-3 text-[12px] font-bold text-teal-700 active:bg-teal-50">
              Log <ChevronDown className={`h-4 w-4 transition-transform ${openId === lead.studentId ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {errorById[lead.studentId] ? (
            <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-[12px] font-semibold text-rose-700">{errorById[lead.studentId]}</p>
          ) : null}
          {openId === lead.studentId && <Disposition lead={lead} onDispose={dispose} />}
        </div>
      ))}
    </div>
  );
}

function Disposition({ lead, onDispose }: { lead: CallLead; onDispose: (l: CallLead, o: string, n: string, cb?: string) => Promise<boolean> }) {
  const [outcome, setOutcome] = useState('interested');
  const [note, setNote] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [saving, setSaving] = useState(false);
  const needsCallback = outcome === 'callback';
  // ── A NOTE IS REQUIRED ONLY WHERE IT CARRIES SOMETHING A FIELD CANNOT ────
  //
  // This used to be `note.trim().length > 0` for EVERY connected outcome, so
  // the Save button stayed disabled until the rep typed something on all five.
  // Sixty calls a day like that produces "ok", "x", "talked" by the end of the
  // first week — and once the remarks are junk the timeline is junk, which
  // destroys the one thing that makes the second call better than the first.
  //
  // So it is mandatory exactly where the free text IS the record: the student
  // refused (why), or asked never to be contacted again (who said it, and when
  // — see the DND note above). For interested / callback / converted the
  // structured fields already carry the meaning, and a short remark is welcome
  // but never extorted. SALES-OS.md §8.
  const NOTE_REQUIRED = new Set(['not_interested', 'dnd']);
  const canSave = !NOTE_REQUIRED.has(outcome) || note.trim().length > 0;

  return (
    <div className="space-y-2.5 border-t border-stone-100 bg-stone-50 px-4 py-3">
      <div className="flex flex-wrap gap-1.5">
        {OUTCOMES.map((o) => (
          <button key={o.key} onClick={() => setOutcome(o.key)}
            className={`rounded-full px-3 py-1 text-[12px] font-bold ${outcome === o.key ? o.cls : 'bg-white text-stone-500 border border-stone-200'}`}>
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
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Feedback (required): what did they say?"
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
      <button
        disabled={!canSave || saving}
        onClick={async () => {
          setSaving(true);
          const ok = await onDispose(lead, outcome, note.trim(), needsCallback ? (callbackAt || defaultCallback()) : undefined);
          if (!ok) setSaving(false); // failed — keep the form so she can retry
        }}
        className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-40">
        {saving ? 'Saving…' : canSave ? 'Save & next' : 'Write feedback to save'}
      </button>
    </div>
  );
}
