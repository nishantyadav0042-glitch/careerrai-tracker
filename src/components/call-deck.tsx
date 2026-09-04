'use client';
import { useState } from 'react';
import { REASON_CATEGORIES, REASON_LABEL, reasonNeedsVerbatim,
  type ReasonCategory } from '@/lib/intervention-taxonomy';
import { SKIP_REASONS, SKIP_REASON_LABEL, type SkipReason } from '@/lib/sales-disposition';
import { MessageCircle, PhoneCall, PhoneOff, ChevronDown, UserRound, Send } from 'lucide-react';
import type { CallLead } from '@/lib/call-queue';
import type { Remark, RemarkHistory } from '@/lib/sales-remarks';
import { SECTION_ORDER, SECTION_LABEL, type DaySection } from '@/lib/sales-day';
import { messageFor, JOURNEY_LABEL } from '@/lib/sales-messages';

const TIER: Record<string, string> = { hot: 'bg-rose-50 text-rose-700', warm: 'bg-amber-50 text-amber-800', cool: 'bg-stone-100 text-stone-500' };
const DUE_CLS: Record<string, string> = {
  callback: 'bg-sky-600 text-white', retry: 'bg-orange-500 text-white', followup: 'bg-amber-500 text-white',
  going_cold: 'bg-rose-600 text-white', broken_streak: 'bg-violet-600 text-white',
  new_never_logged: 'bg-teal-600 text-white', conversion: 'bg-emerald-600 text-white',
  attention: 'bg-indigo-600 text-white',
  fresh: 'bg-stone-200 text-stone-600', rotation: 'bg-stone-300 text-stone-700',
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
  // CLOSING A CARD WITHOUT ACTING (founder, 3 Sep 2026). Every card must end
  // the day marked; a counsellor who cannot honestly log a call needs a way to
  // say so. It is deliberately two taps and demands a reason — skipping should
  // cost slightly more than working — and it changes nothing about the
  // student, who returns to tomorrow's queue on the same terms.
  { key: 'skipped', label: 'Skip today', cls: 'bg-stone-500 text-white' },
];

function defaultCallback(): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  ist.setUTCHours(18, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCDate())}T18:00`;
}

export function CallDeck({ queue, repFirstName }: { queue: CallLead[]; repFirstName: string }) {
  const [list, setList] = useState(queue);
  const [done, setDone] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  // Which card has the 'what did you message?' box open, and its draft.
  // Founder order, 3 Sep: a sent message must carry the rep's own words -
  // the one-tap auto-note said a message existed, never what it said.
  const [msgOpenId, setMsgOpenId] = useState<string | null>(null);
  const [msgNote, setMsgNote] = useState('');
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  // ── ONE TAP IS ONE ATTEMPT ────────────────────────────────────────────────
  //
  // The "No answer" quick action had no in-flight guard, and the only real
  // counsellor interaction in production proves what that costs: Neelam's
  // single tap on 29 Aug wrote TWO identical no_answer rows 2.8s apart and left
  // no_answer_count at 2. The detailed Save button next to it was already
  // guarded by `saving`; this path never was.
  //
  // It is not a cosmetic double-record. no_answer_count drives the contact
  // ceiling that suppresses a lead, so a student who is counted twice per dial
  // drops out of the queue after HALF the attempts we intended to make — and
  // every "attempts" number we report is inflated by the same factor.
  //
  // Guarded inside dispose() rather than on the button, so it covers the
  // Disposition panel and any future caller too: one authority, not one
  // patched call site.
  const [inFlight, setInFlight] = useState<Record<string, boolean>>({});

  // NOT optimistic (20 Aug, Sales Phase 1): the lead leaves the deck only
  // after the server confirms the write. The old version removed the card
  // regardless — a rejected disposition looked identical to a saved one, and
  // the lead was gone from the rep's day with nothing recorded.
  const dispose = async (
    lead: CallLead, outcome: string, note: string, callbackAt?: string,
    reasonCategory?: string | null, reasonVerbatim?: string | null,
    skipReason?: string | null,
  ): Promise<boolean> => {
    if (inFlight[lead.studentId]) return false;
    setInFlight((f) => ({ ...f, [lead.studentId]: true }));
    setErrorById((e) => ({ ...e, [lead.studentId]: '' }));
    let failure = 'Could not save the call — check your connection and try again.';
    try {
      const res = await fetch('/api/sales/log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: lead.studentId, outcome, note, callbackAt, hot: lead.hot,
          reasonCategory: reasonCategory ?? null,
          reasonVerbatim: reasonVerbatim ?? null,
          skipReason: skipReason ?? null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok === true) {
        setDone((d) => d + 1);
        setList((l) => l.filter((x) => x.studentId !== lead.studentId));
        setOpenId(null);
        setInFlight((f) => ({ ...f, [lead.studentId]: false }));
        return true;
      }
      if (json?.error) failure = json.error;
    } catch { /* network failure — fall through to the shared message */ }
    // Released on failure too. The guard must never outlive the request: a
    // save that is rejected has to be retryable, or the guard becomes a worse
    // bug than the double-write it prevents.
    setInFlight((f) => ({ ...f, [lead.studentId]: false }));
    setErrorById((e) => ({ ...e, [lead.studentId]: failure }));
    return false;
  };

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="text-lg font-bold text-emerald-800">Queue cleared for now 👏</p>
        <p className="mt-1 text-sm text-emerald-700">Every card marked — {done} this session. New leads and callbacks roll in through the day; tomorrow&rsquo;s list is dealt at 4 AM.</p>
      </div>
    );
  }

  // THE DAY IN SECTIONS (founder, 2 Sep): promises, money, buddy interest,
  // new arrivals, attention, slipping, rotation — in that order, each with its
  // count, so the mix is visible and a counsellor never works only one kind.
  const bySection = new Map<DaySection, CallLead[]>();
  for (const lead of list) {
    const key = (lead.section ?? 'rotation') as DaySection;
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)!.push(lead);
  }

  const card = (lead: CallLead) => (
        <div key={lead.studentId} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between gap-2">
              <a href={`/sales/student/${lead.studentId}`} className="truncate text-[15px] font-bold text-stone-900 hover:underline">{lead.name}</a>
              {/* Founder, 2 Sep: a Profile button beside every student, not a
                  name that happens to be a link. The counsellor should never
                  have to know that the name is clickable. */}
              <a href={`/sales/student/${lead.studentId}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-stone-300 bg-white px-2 py-0.5 text-[10px] font-bold text-stone-700 hover:border-stone-500">
                <UserRound className="h-3 w-3" /> Profile
              </a>
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
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <p className="text-xs text-stone-500">{lead.phone ?? 'no phone'}</p>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${TIER[lead.tier]}`}>{lead.tier.toUpperCase()}</span>
              <span className="text-[11px] text-stone-400">momentum {lead.momentumScore}</span>
              {/* CHANNEL (founder, 2 Sep): half the day is a message. The card
                  says which, so the counsellor never has to decide. */}
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${
                lead.channel === 'message' ? 'bg-amber-100 text-amber-800' : 'bg-stone-900 text-white'}`}>
                {lead.channel === 'message' ? 'Message first' : 'Call'}
              </span>
            </div>
            {/* THE JOURNEY (founder, 2 Sep): install → notifications → daily
                log. One stage, one next step — nothing beyond it. */}
            {lead.journey && (
              <p className="mt-1 text-[11px] text-stone-500">
                <span className="font-semibold text-stone-700">{JOURNEY_LABEL[lead.journey]}</span>
                {lead.nextStep ? <> · next: {lead.nextStep}</> : null}
              </p>
            )}
            {/* WHY THIS STUDENT IS HERE (founder, 24 Aug): the lane's trigger
                with real numbers, then the recommended move. This block is
                what makes the card intelligence, not a phone list. */}
            <div className="mt-2 rounded-lg bg-stone-50 px-2.5 py-2">
              {lead.why.map((w, i) => (
                <p key={i} className="text-[12px] font-semibold leading-snug text-stone-700">{w}</p>
              ))}
              {/* WHAT WAS SAID — every remark, not the newest row. This is the
                  whole reason the second call is better than the first. */}
              <Remarks h={lead.remarks} repFirstName={repFirstName} />
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
              <a href={`https://wa.me/${lead.waNumber}?text=${encodeURIComponent(messageFor({
                  firstName: lead.firstName, repFirstName, lane: lead.dueReason, stage: lead.journey ?? null, daysSilent: lead.daysSilent ?? null,
                }))}`}
                target="_blank" rel="noopener noreferrer"
                className={`flex items-center justify-center gap-1 bg-[#25d366] px-3 py-3 text-[12px] font-bold text-[#04331c] active:scale-95 ${lead.channel === 'message' ? 'flex-1' : ''}`}>
                <MessageCircle className="h-4 w-4" /> {lead.channel === 'message' ? 'Message' : 'WA'}
              </a>
            )}
            {/* A message is a touch the day must record (2 Sep) - and since
                3 Sep it must record WHAT was sent (founder order): the tap
                opens a one-line box instead of firing an empty note. */}
            <button onClick={() => { setMsgOpenId(msgOpenId === lead.studentId ? null : lead.studentId); setMsgNote(''); }}
              disabled={inFlight[lead.studentId]}
              className="flex items-center justify-center gap-1 bg-white px-3 py-3 text-[12px] font-semibold text-amber-800 active:scale-95 disabled:opacity-50">
              <Send className="h-4 w-4" /> Messaged
            </button>
            <button onClick={() => void dispose(lead, 'no_answer', '')} disabled={inFlight[lead.studentId]} className="flex items-center justify-center gap-1 bg-white px-3 py-3 text-[12px] font-semibold text-orange-600 active:bg-orange-50 disabled:opacity-40" title="Didn't pick up">
              <PhoneOff className="h-4 w-4" /> No answer
            </button>
            <button onClick={() => setOpenId(openId === lead.studentId ? null : lead.studentId)} className="flex items-center justify-center gap-1 bg-white px-3 py-3 text-[12px] font-bold text-teal-700 active:bg-teal-50">
              Log <ChevronDown className={`h-4 w-4 transition-transform ${openId === lead.studentId ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {errorById[lead.studentId] ? (
            <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-[12px] font-semibold text-rose-700">{errorById[lead.studentId]}</p>
          ) : null}
          {msgOpenId === lead.studentId && (
            <div className="flex items-stretch gap-2 border-t border-amber-100 bg-amber-50/60 px-4 py-2.5">
              <input value={msgNote} onChange={(e) => setMsgNote(e.target.value)} autoFocus
                placeholder="What did you message them? (required)"
                className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
              <button disabled={msgNote.trim().length === 0 || inFlight[lead.studentId]}
                onClick={async () => { const ok = await dispose(lead, 'messaged', msgNote.trim()); if (ok) { setMsgOpenId(null); setMsgNote(''); } }}
                className="rounded-lg bg-amber-700 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-40">
                Save
              </button>
            </div>
          )}
          {openId === lead.studentId && <Disposition lead={lead} onDispose={dispose} />}
        </div>
  );

  return (
    <div className="space-y-3">
      {/* EVERY CARD ENDS THE DAY MARKED (founder, 3 Sep 2026). The old line
          read "N in your queue", which says nothing about whether the day was
          finished. This one names the job that is left. */}
      <p className="px-1 text-center text-xs font-semibold text-stone-500">
        {done} marked · <span className="text-stone-800">{list.length} still to mark</span>
      </p>
      {SECTION_ORDER.filter((k) => (bySection.get(k)?.length ?? 0) > 0).map((k) => (
        <section key={k} className="space-y-3">
          <h2 className="flex items-baseline gap-2 px-1 pt-1 text-[11px] font-bold uppercase tracking-widest text-stone-400">
            {SECTION_LABEL[k]} <span className="text-stone-500">{bySection.get(k)!.length}</span>
          </h2>
          {bySection.get(k)!.map(card)}
        </section>
      ))}
    </div>
  );
}

function Disposition({ lead, onDispose }: {
  lead: CallLead;
  onDispose: (
    l: CallLead, o: string, n: string, cb?: string,
    reason?: string | null, verbatim?: string | null, skipReason?: string | null,
  ) => Promise<boolean>;
}) {
  const [outcome, setOutcome] = useState('interested');
  const [note, setNote] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [saving, setSaving] = useState(false);
  const needsCallback = outcome === 'callback';

  // ── WHAT THE STUDENT SAID (29 Aug 2026) ─────────────────────────────────
  //
  // This existed on the single-student page and NOT here, which meant it did
  // not exist: /sales is where a counsellor spends the day, and nobody opens
  // sixty student pages to record a category. Every call worked from the queue
  // wrote reason_category = NULL, so the taxonomy, the ledger column and the
  // founder's product-intelligence view were all being fed nothing by the one
  // workflow that actually runs.
  //
  // Founder, 30 Aug: the founder should be able to learn what students are
  // saying without personally talking to every student. One student saying
  // "the timetable does not fit my coaching" is an anecdote; thirty saying it
  // is a product requirement — but only if it was recorded as a CATEGORY,
  // because free text cannot aggregate.
  //
  // OPTIONAL, DELIBERATELY. Feedback is a by-product of the work, not the job.
  // Forcing it on sixty calls a day produces whatever option sits at the top of
  // the list, which is worse than nothing because it looks like data. The one
  // exception is `other`, where the free text IS the record and the taxonomy
  // already demands it.
  //
  // Connected outcomes only: nobody spoke to a student who did not answer, so
  // asking why they are not studying would be inviting the rep to guess.
  const [reason, setReason] = useState<ReasonCategory | ''>('');
  const [reasonVerbatim, setReasonVerbatim] = useState('');
  const [skipReason, setSkipReason] = useState<SkipReason | ''>('');
  const isSkip = outcome === 'skipped';
  // Nobody spoke to a student who was skipped either, so the "why aren't they
  // studying" taxonomy is as inapplicable here as it is to an unanswered dial.
  const asksReason = outcome !== 'no_answer' && !isSkip;
  const needsVerbatim = asksReason && reasonNeedsVerbatim(reason || null);
  // ── A NOTE IS REQUIRED ON EVERY CONNECTED OUTCOME ────────────────────────
  //
  // Founder order, 3 Sep (SALES-OS §8 amendment, recorded there): every
  // conversation carries the rep's own words. An earlier version relaxed this
  // to not_interested/dnd only, fearing "ok"/"x" junk — but the server never
  // relaxed with it, so interested/callback/converted saves were passing a
  // disabled-looking gate here only to 400 on the API. Client and server now
  // enforce the SAME rule, and the junk-remark risk is managed by review of
  // the daily snapshot, not by dropping the record.
  const NOTE_REQUIRED = new Set(['interested', 'callback', 'converted', 'not_interested', 'dnd']);
  // The API rejects `other` without at least 3 characters of verbatim, so the
  // button has to know that too — otherwise the rep taps Save, the request
  // fails, and the card stays put with no explanation.
  const canSave = (!NOTE_REQUIRED.has(outcome) || note.trim().length > 0)
    && (!needsVerbatim || reasonVerbatim.trim().length >= 3)
    // A skip without a reason is the blank cell this whole change exists to
    // remove, so the API rejects it and the button knows that too.
    && (!isSkip || skipReason !== '');

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
      {isSkip && (
        <div className="rounded-lg border border-stone-300 bg-white p-2.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-stone-600">
            Why are you skipping {lead.firstName} today?
          </label>
          <select value={skipReason} onChange={(e) => setSkipReason(e.target.value as SkipReason | '')}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
            <option value="">— pick one —</option>
            {SKIP_REASONS.map((r) => (
              <option key={r} value={r}>{SKIP_REASON_LABEL[r]}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-stone-500">
            Nothing changes for {lead.firstName} — they come back tomorrow. This just closes the card honestly.
          </p>
        </div>
      )}
      {needsCallback && (
        <div>
          <label className="text-[11px] font-semibold text-stone-500">Call back at (the time they said)</label>
          <input type="datetime-local" value={callbackAt || defaultCallback()} onChange={(e) => setCallbackAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
        </div>
      )}
      {asksReason && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-2.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-teal-800">
            Why aren&apos;t they studying / buying? (their reason, not yours)
          </label>
          <select
            value={reason}
            onChange={(e) => { setReason(e.target.value as ReasonCategory | ''); setReasonVerbatim(''); }}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
            <option value="">— optional: what they actually said —</option>
            {REASON_CATEGORIES.map((r) => (
              <option key={r} value={r}>{REASON_LABEL[r]}</option>
            ))}
          </select>
          {needsVerbatim && (
            <input
              value={reasonVerbatim}
              onChange={(e) => setReasonVerbatim(e.target.value)}
              placeholder="In their words — this is how a new category gets found"
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
          )}
        </div>
      )}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Feedback (required): what did they say?"
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
      <button
        disabled={!canSave || saving}
        onClick={async () => {
          setSaving(true);
          const ok = await onDispose(
            lead, outcome, note.trim(),
            needsCallback ? (callbackAt || defaultCallback()) : undefined,
            asksReason ? (reason || null) : null,
            asksReason && reasonVerbatim.trim() ? reasonVerbatim.trim() : null,
            isSkip ? skipReason : null,
          );
          if (!ok) setSaving(false); // failed — keep the form so she can retry
        }}
        className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-40">
        {saving ? 'Saving…' : canSave ? (isSkip ? 'Skip & next' : 'Save & next') : isSkip ? 'Pick a reason to skip' : 'Write feedback to save'}
      </button>
    </div>
  );
}


// ── WHAT WAS SAID (founder order, 4 Sep 2026) ───────────────────────────────
//
// "Salesman should also be able to see their last remarks which should be
// visible next time, for each remark they have filled."
//
// Three rules, each of which the old single-row block broke:
//
//  1. LEAD WITH THE WORDS, NOT THE NEWEST ROW. no_answer is the commonest
//     disposition in production and it carries the auto-note "Did not pick
//     up" — so one unanswered dial used to bury the actual conversation from
//     the call before it. The newest TYPED remark comes first, however old.
//  2. THE UNANSWERED DIAL STILL COUNTS. It is shown underneath, because "we
//     tried yesterday and got nothing" changes how the next call opens.
//  3. ALL OF IT IS REACHABLE FROM HERE. Every established CRM puts recent
//     notes on the working surface and the rest one expand away (HubSpot's
//     lead record shows the last five; Pipedrive's Focus section pins what
//     matters above the history). Sending a counsellor to another page mid-day
//     means the history is read when there is time and skipped when there
//     isn't — which is the same as not having it.
//
// Attribution appears only when somebody ELSE wrote the remark. On a
// reassigned lead the previous rep's words are the most valuable thing on the
// card, and the counsellor must know they are quoting a colleague rather than
// remembering their own call.
function outcomeWords(o: string | null): string {
  return o ? o.replace(/_/g, ' ') : 'touched';
}
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function RemarkLine({ r, repFirstName }: { r: Remark; repFirstName: string }) {
  const other = r.by && r.by.trim().split(' ')[0].toLowerCase() !== repFirstName.trim().toLowerCase()
    ? r.by.trim().split(' ')[0] : null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
        {dayLabel(r.atIso)} · {outcomeWords(r.outcome)}
        {other ? <span className="text-stone-500"> · {other}</span> : null}
      </p>
      {r.note ? (
        <p className={`mt-0.5 text-[12px] leading-snug ${r.typed ? 'font-semibold italic text-stone-700' : 'text-stone-500'}`}>
          {r.typed ? <>&ldquo;{r.note}&rdquo;</> : r.note}
        </p>
      ) : (
        <p className="mt-0.5 text-[12px] text-stone-400">Nothing written down</p>
      )}
    </div>
  );
}

function Remarks({ h, repFirstName }: { h: RemarkHistory; repFirstName: string }) {
  const [open, setOpen] = useState(false);
  // Nobody has ever spoken to this student. Saying so is the fresh lane's job
  // on the same card; an empty quote box here would just be furniture.
  if (h.total === 0) return null;

  const lead = h.lastTyped ?? h.last;
  // The newest touch, shown under the words only when it is a DIFFERENT row —
  // otherwise the card would print the same remark twice.
  const alsoLast = h.last && lead && h.last.atIso !== lead.atIso ? h.last : null;

  return (
    <div className="mt-1.5 rounded-lg bg-stone-100 px-2.5 py-1.5">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-stone-400">
        What was said · {h.total} {h.total === 1 ? 'remark' : 'remarks'}
      </p>
      {open ? (
        <div className="space-y-2">
          {h.remarks.map((r, i) => <RemarkLine key={`${r.atIso}-${i}`} r={r} repFirstName={repFirstName} />)}
          {h.total > h.remarks.length && (
            <p className="text-[11px] text-stone-500">
              Showing the newest {h.remarks.length} of {h.total} — the rest are on their profile.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {lead && <RemarkLine r={lead} repFirstName={repFirstName} />}
          {alsoLast && (
            <p className="text-[11px] text-stone-500">
              Then {outcomeWords(alsoLast.outcome)} · {dayLabel(alsoLast.atIso)}
            </p>
          )}
        </div>
      )}
      {h.total > 1 && (
        <button type="button" onClick={() => setOpen(!open)}
          className="mt-1 text-[11px] font-bold text-teal-700 underline underline-offset-2">
          {open ? 'Show less' : `Show all ${h.total}`}
        </button>
      )}
    </div>
  );
}
