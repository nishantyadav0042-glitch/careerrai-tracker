'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { track } from '@/lib/journey';

// Two numbers. That's the entire ask.
//
// This is the smallest question that turns "I studied Percentages" into
// something we can reason about: how many did you attempt, how many were
// right. Without it the app holds only opinions, and 200 questions at 34%
// looks exactly like 110 at 81%.
//
// It is always skippable. A student who closes it still keeps their streak,
// their completed task and their log entry — the block is already done by the
// time this appears. Making it mandatory would buy better data by making the
// app worse, and an app people avoid produces no data at all.

const LEVELS = [
  { id: 'easy',   label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard',   label: 'Hard' },
  { id: 'timed',  label: 'Timed' },
] as const;

type Level = (typeof LEVELS)[number]['id'];

interface EvidenceResult {
  passed: number;
  total: number;
  checks: { id: string; label: string; done: boolean; detail: string }[];
}

export function EvidenceCapture({ topic, onClose }: { topic: string; onClose: () => void }) {
  const [level, setLevel] = useState<Level>('medium');
  const [attempted, setAttempted] = useState('');
  const [correct, setCorrect] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvidenceResult | null>(null);

  const a = Number(attempted);
  const c = Number(correct);
  const valid = Number.isFinite(a) && a >= 1 && a <= 500 && Number.isFinite(c) && c >= 0 && c <= a;

  async function save() {
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/evidence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, difficulty: level, attempted: a, correct: c, source: 'routine' }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Could not save.'); setBusy(false); return; }
      track('evidence_logged', { topic, difficulty: level, attempted: a, correct: c });
      setResult(json.evidence as EvidenceResult);
    } catch {
      setError('Could not save. Please try again.');
    }
    setBusy(false);
  }

  // After saving, show the ladder — the point of asking. A student who just
  // logged 20 questions should see which rung it moved, not a toast.
  if (result) {
    return (
      <Shell onClose={onClose}>
        <p className="text-[15px] font-bold text-stone-900">{topic}</p>
        <p className="mt-0.5 text-[13px] text-stone-500">
          {result.passed} of {result.total} checks earned
        </p>
        <div className="mt-3 space-y-2">
          {result.checks.map((ch) => (
            <div key={ch.id} className="flex items-start gap-2">
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                ch.done ? 'bg-emerald-600' : 'bg-stone-200'
              }`}>
                {ch.done && <Check className="h-2.5 w-2.5 text-white" />}
              </span>
              <div className="min-w-0">
                <p className={`text-[12px] font-semibold ${ch.done ? 'text-stone-800' : 'text-stone-500'}`}>{ch.label}</p>
                <p className="text-[11px] text-stone-400">{ch.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button" onClick={onClose}
          className="mt-4 w-full rounded-xl bg-stone-900 py-3 text-[14px] font-bold text-white"
        >
          Done
        </button>
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose}>
      <p className="text-[15px] font-bold text-stone-900">How did {topic} go?</p>
      <p className="mt-0.5 text-[12px] text-stone-500">
        Two numbers. This is what separates real progress from time spent.
      </p>

      <div className="mt-3 flex gap-1.5">
        {LEVELS.map((l) => (
          <button
            key={l.id} type="button" onClick={() => setLevel(l.id)}
            className={`flex-1 rounded-lg py-2 text-[12px] font-bold ${
              level === l.id ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] font-semibold text-stone-500">Attempted</span>
          <input
            type="number" inputMode="numeric" min={1} max={500}
            value={attempted} onChange={(e) => setAttempted(e.target.value)}
            className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[15px] font-semibold text-stone-900"
            placeholder="20"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-stone-500">Correct</span>
          <input
            type="number" inputMode="numeric" min={0}
            value={correct} onChange={(e) => setCorrect(e.target.value)}
            className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[15px] font-semibold text-stone-900"
            placeholder="13"
          />
        </label>
      </div>

      {/* Live accuracy, so the number means something before they submit. */}
      {valid && a > 0 && (
        <p className="mt-2 text-[12px] font-semibold text-stone-600">
          {Math.round((c / a) * 100)}% accuracy
        </p>
      )}
      {attempted !== '' && correct !== '' && !valid && (
        <p className="mt-2 text-[12px] text-rose-600">Correct can&apos;t be more than attempted.</p>
      )}
      {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}

      <button
        type="button" onClick={() => void save()} disabled={!valid || busy}
        className="mt-3 w-full rounded-xl bg-orange-500 py-3 text-[14px] font-bold text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button" onClick={onClose}
        className="mt-1.5 w-full py-2 text-[12px] font-semibold text-stone-400"
      >
        Skip for now
      </button>
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="mb-1 flex justify-end">
          <button type="button" onClick={onClose} aria-label="Close" className="text-stone-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
