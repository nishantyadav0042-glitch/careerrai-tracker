'use client';

import { useState } from 'react';
import { X, HeartHandshake } from 'lucide-react';
import { track } from '@/lib/journey';
import { TOPIC_METADATA } from '@/lib/topics-constants';

// "Help the next student" — for the students, by the students.
//
// Four buckets, chosen because each one has an exact HOME in the curriculum:
// a tip lands inside the study plan at its topic, a mistake shows before
// practice, a shortcut after the concept, a question enters the Daily Proof
// bank. The contributor isn't making a post — they're improving how the topic
// is taught to everyone after them, and the promise says exactly that.
// Everything passes human verification first; nothing reaches students raw.

const TOPICS = Object.keys(TOPIC_METADATA).sort();

const KINDS = [
  { id: 'tip',      emoji: '💡', label: 'A tip',            hint: 'Something that made this topic click for you' },
  { id: 'mistake',  emoji: '❌', label: 'A common mistake', hint: 'The trap you fell into, so the next student doesn\u2019t' },
  { id: 'shortcut', emoji: '⚡', label: 'A shortcut',       hint: 'A faster way you found or were taught' },
  { id: 'question', emoji: '🎯', label: 'A great question', hint: 'A question that taught you something' },
] as const;
type Kind = (typeof KINDS)[number]['id'];

const TEXT_PLACEHOLDER: Record<string, string> = {
  tip: 'e.g. For percentages, convert everything to fractions first — 37.5% is just 3/8…',
  mistake: 'e.g. In seating puzzles I always forgot the ones facing SOUTH reverse left and right…',
  shortcut: 'e.g. Successive discounts of a% and b% = a + b − ab/100 in one step…',
};

export function CommunitySubmit({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('tip');
  const [topic, setTopic] = useState('');
  const [tip, setTip] = useState('');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState<number | null>(null);
  const [explanation, setExplanation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = kind === 'question'
        ? { kind, topic, question, options: options.filter((o) => o.trim()), correct_index: correct, explanation }
        : { kind, topic, tip };
      const res = await fetch('/api/community/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Could not send.'); setBusy(false); return; }
      track('community_submitted', { kind, topic });
      setSent(json.message as string);
    } catch { setError('Could not send. Please try again.'); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500">
            <HeartHandshake className="h-5 w-5 text-white" />
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-stone-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <>
            <p className="mt-3 text-[16px] font-bold text-stone-900">Sent 🙌</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-stone-600">{sent}</p>
            <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl bg-stone-900 py-3 text-[14px] font-bold text-white">
              Done
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-[16px] font-bold text-stone-900">Help the next student</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-stone-600">
              What you learned the hard way, the next student gets for free. We verify
              everything — approved contributions become
              <span className="font-semibold"> part of how the topic is taught</span> on CareerRai.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k.id} type="button" onClick={() => setKind(k.id)}
                  className={`rounded-xl px-2 py-2.5 text-left ${
                    kind === k.id ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'
                  }`}
                >
                  <span className="block text-[13px] font-bold">{k.emoji} {k.label}</span>
                  <span className={`mt-0.5 block text-[10px] leading-snug ${kind === k.id ? 'text-white/60' : 'text-stone-500'}`}>{k.hint}</span>
                </button>
              ))}
            </div>

            <label className="mt-3 block">
              <span className="text-[11px] font-semibold text-stone-500">Which topic is this about?</span>
              <select
                value={topic} onChange={(e) => setTopic(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[14px] text-stone-900"
              >
                <option value="">Pick a topic…</option>
                {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            {kind !== 'question' ? (
              <label className="mt-3 block">
                <span className="text-[11px] font-semibold text-stone-500">
                  {kind === 'tip' ? 'Your tip' : kind === 'mistake' ? 'The mistake to avoid' : 'Your shortcut'}
                </span>
                <textarea
                  value={tip} onChange={(e) => setTip(e.target.value)} rows={4}
                  placeholder={TEXT_PLACEHOLDER[kind]}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[14px] text-stone-900"
                />
              </label>
            ) : (
              <>
                <label className="mt-3 block">
                  <span className="text-[11px] font-semibold text-stone-500">The question</span>
                  <textarea
                    value={question} onChange={(e) => setQuestion(e.target.value)} rows={3}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[14px] text-stone-900"
                  />
                </label>
                <div className="mt-3 space-y-2">
                  <span className="text-[11px] font-semibold text-stone-500">Options — tap the correct one</span>
                  {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button
                        type="button" onClick={() => setCorrect(i)}
                        aria-label={`Mark option ${i + 1} correct`}
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
                          correct === i ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-500'
                        }`}
                      >
                        {String.fromCharCode(65 + i)}
                      </button>
                      <input
                        value={opt}
                        onChange={(e) => setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                        className="w-full rounded-xl border border-stone-200 px-3 py-2 text-[14px] text-stone-900"
                      />
                    </div>
                  ))}
                </div>
                <label className="mt-3 block">
                  <span className="text-[11px] font-semibold text-stone-500">Why is that the answer? (this is what helps)</span>
                  <textarea
                    value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={3}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[14px] text-stone-900"
                  />
                </label>
              </>
            )}

            {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}

            <button
              type="button" disabled={busy || !topic} onClick={() => void submit()}
              className="mt-4 w-full rounded-xl bg-orange-500 py-3 text-[14px] font-bold text-white disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send for review'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
