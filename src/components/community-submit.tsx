'use client';

import { useState } from 'react';
import { X, HeartHandshake } from 'lucide-react';
import { track } from '@/lib/journey';
import { TOPIC_METADATA } from '@/lib/topics-constants';

// "Help a friend" — for the students, by the students.
//
// A tip or a tricky question, tagged to a real topic. Everything lands in the
// founder's verification queue; nothing reaches other students unreviewed.
// The submission promise is explicit about both halves: it will be checked,
// and if it's good, it ships WITH YOUR NAME. Credit is the reward.

const TOPICS = Object.keys(TOPIC_METADATA).sort();

export function CommunitySubmit({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<'tip' | 'question'>('tip');
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
      const body = kind === 'tip'
        ? { kind, topic, tip }
        : { kind, topic, question, options: options.filter((o) => o.trim()), correct_index: correct, explanation };
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
            <p className="mt-3 text-[16px] font-bold text-stone-900">Help a friend</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-stone-600">
              Share a tip that worked for you, or a question that taught you something.
              We check everything before it goes out — and if it&apos;s approved, the whole
              community sees it <span className="font-semibold">with your name on it</span>.
            </p>

            <div className="mt-3 flex gap-1.5">
              {(['tip', 'question'] as const).map((k) => (
                <button
                  key={k} type="button" onClick={() => setKind(k)}
                  className={`flex-1 rounded-lg py-2 text-[12px] font-bold capitalize ${
                    kind === k ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {k === 'tip' ? 'A tip' : 'A question'}
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

            {kind === 'tip' ? (
              <label className="mt-3 block">
                <span className="text-[11px] font-semibold text-stone-500">Your tip</span>
                <textarea
                  value={tip} onChange={(e) => setTip(e.target.value)} rows={4}
                  placeholder="e.g. For percentages, convert everything to fractions first — 37.5% is just 3/8…"
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
