'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Closing a call, in about 15 seconds.
//
// Founder, 5 Aug: "keep the after-session feedback as quick as possible —
// buddies are IIM alumni plus working professionals, they don't have much
// time." So: two taps and done. No free typing required, no rating scales, no
// essay box. The commitment chips are generated from THIS student's real
// state, so the common case is a single tap on something already true.
//
// Why it exists at all: a mentor ran a 10/10 orientation with our first paying
// student and the app captured nothing — no completion, no note, no next step.
// Our best moment was invisible. This is the 15 seconds that fixes that.

export interface CloseoutProps {
  studentId: string;
  studentFirstName: string;
  sessionId: string | null;
  /** The open promise from last time, if any. */
  openCommitment: { id: string; commitment: string } | null;
  /** Chips built from this student's actual weak spots. */
  suggestions: string[];
}

type Read = 'on_track' | 'struggling' | 'worried';
type Outcome = 'kept' | 'partial' | 'missed';

const READS: { key: Read; label: string }[] = [
  { key: 'on_track', label: 'On track' },
  { key: 'struggling', label: 'Struggling' },
  { key: 'worried', label: 'Worried' },
];
const OUTCOMES: { key: Outcome; label: string }[] = [
  { key: 'kept', label: 'Kept' },
  { key: 'partial', label: 'Partly' },
  { key: 'missed', label: 'Missed' },
];

export function CallCloseout(props: CloseoutProps) {
  const router = useRouter();
  const [read, setRead] = useState<Read>('on_track');
  const [outcome, setOutcome] = useState<Outcome>('kept');
  const [commitment, setCommitment] = useState('');
  const [typing, setTyping] = useState(false);
  const [strength, setStrength] = useState('');
  const [weakness, setWeakness] = useState('');
  const [tasks, setTasks] = useState<string[]>(['', '', '']);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!commitment.trim()) { setError('Pick what they committed to.'); return; }
    if (!strength.trim() || !weakness.trim()) {
      setError('One strength and one thing to fix — your student reads both.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/buddy/commitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: props.studentId,
          commitment,
          readState: read,
          sessionId: props.sessionId,
          previousOutcome: props.openCommitment ? outcome : null,
          strength,
          weakness,
          assignments: tasks.map((t) => t.trim()).filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Couldn't save."); setSaving(false); return; }
      setDone(true);
      router.refresh();
    } catch {
      setError('Network hiccup — try once more.');
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
        <p className="text-sm font-bold text-teal-900">Call closed ✓</p>
        <p className="mt-0.5 text-[13px] text-teal-800">
          {props.studentFirstName} has your notes and their checklist. Your next call opens with this promise.
        </p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-600">After the call</p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">under a minute</p>
      </div>

      <div className="space-y-4 p-4">
        {/* Settle last time's promise first — one tap. */}
        {props.openCommitment && (
          <div>
            <p className="text-[13px] font-bold text-stone-900">
              Last time: “{props.openCommitment.commitment}”
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.key} type="button" onClick={() => setOutcome(o.key)}
                  aria-pressed={outcome === o.key}
                  className={`rounded-xl border px-2 py-2 text-[13px] font-bold transition-colors ${
                    outcome === o.key
                      ? 'border-teal-600 bg-teal-50 text-teal-700'
                      : 'border-stone-200 bg-white text-stone-700'
                  }`}
                >{o.label}</button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-[13px] font-bold text-stone-900">How is {props.studentFirstName} doing?</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {READS.map((r) => (
              <button
                key={r.key} type="button" onClick={() => setRead(r.key)}
                aria-pressed={read === r.key}
                className={`rounded-xl border px-2 py-2 text-[13px] font-bold transition-colors ${
                  read === r.key
                    ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : 'border-stone-200 bg-white text-stone-700'
                }`}
              >{r.label}</button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[13px] font-bold text-stone-900">What did they commit to?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {props.suggestions.map((s) => (
              <button
                key={s} type="button"
                onClick={() => { setCommitment(s); setTyping(false); }}
                aria-pressed={commitment === s && !typing}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
                  commitment === s && !typing
                    ? 'border-teal-600 bg-teal-50 font-semibold text-teal-700'
                    : 'border-dashed border-stone-300 text-stone-600'
                }`}
              >{s}</button>
            ))}
            <button
              type="button" onClick={() => { setTyping(true); setCommitment(''); }}
              aria-pressed={typing}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
                typing ? 'border-teal-600 bg-teal-50 font-semibold text-teal-700' : 'border-dashed border-stone-300 text-stone-600'
              }`}
            >Type my own…</button>
          </div>
          {typing && (
            <input
              autoFocus value={commitment} onChange={(e) => setCommitment(e.target.value)}
              placeholder="e.g. Finish Arithmetic by Sunday"
              className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-[14px] outline-none focus:border-teal-600"
            />
          )}
        </div>

        {/* One strength, one weakness — founder, 5 Aug. Two single lines, not a
            form: a debrief a working professional has no time to write is a
            debrief that never happens. The student sees both verbatim, which
            is why the placeholders show what a useful one looks like. */}
        <div>
          <p className="text-[13px] font-bold text-stone-900">One thing {props.studentFirstName} did well</p>
          <input
            value={strength} onChange={(e) => setStrength(e.target.value)}
            placeholder="e.g. Actually finished the LR set we agreed on"
            className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-[14px] outline-none focus:border-teal-600"
          />
        </div>

        <div>
          <p className="text-[13px] font-bold text-stone-900">One thing to fix</p>
          <input
            value={weakness} onChange={(e) => setWeakness(e.target.value)}
            placeholder="e.g. Still skipping the accuracy check after each set"
            className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-[14px] outline-none focus:border-teal-600"
          />
        </div>

        {/* The 3–4 tasks that back the promise. Blank rows are ignored, so a
            mentor in a hurry can fill one and go. */}
        <div>
          <p className="text-[13px] font-bold text-stone-900">What should they do before next time?</p>
          <p className="mt-0.5 text-[11.5px] text-stone-500">Up to 4. These become a checklist on their home screen.</p>
          <div className="mt-2 space-y-2">
            {tasks.map((t, i) => (
              <input
                key={i} value={t}
                onChange={(e) => setTasks(tasks.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder={i === 0 ? 'e.g. 2 LR sets, timed' : `Task ${i + 1} (optional)`}
                aria-label={`Task ${i + 1}`}
                className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-[14px] outline-none focus:border-teal-600"
              />
            ))}
          </div>
          {tasks.length < 4 && (
            <button
              type="button" onClick={() => setTasks([...tasks, ''])}
              className="mt-2 text-[12.5px] font-semibold text-teal-700"
            >+ Add one more</button>
          )}
        </div>

        {error && <p className="text-[12.5px] font-medium text-red-700">{error}</p>}

        <button
          type="button" onClick={save} disabled={saving}
          className="w-full rounded-xl bg-stone-900 py-3 text-[14px] font-bold text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save & close'}
        </button>
      </div>
    </section>
  );
}
