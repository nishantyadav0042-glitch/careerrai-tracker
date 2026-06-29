'use client';

import { useEffect } from 'react';

// A read-only example of how a buddy decodes a mock — the "taste" of the paid
// mock-analysis. Viewing it is an engagement signal (sample_debrief_viewed).
const ERRORS = [
  { label: 'Silly mistakes', count: 6, tone: 'bg-amber-100 text-amber-800' },
  { label: 'Time mismanagement', count: 4, tone: 'bg-red-100 text-red-700' },
  { label: 'Conceptual gaps', count: 2, tone: 'bg-purple-100 text-purple-700' },
];

export function SampleDebrief() {
  useEffect(() => {
    fetch('/api/engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'sample_debrief_viewed' }),
    }).catch(() => {});
  }, []);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">Sample mock debrief</span>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">Example</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[['VARC', '88%ile'], ['DILR', '71%ile'], ['QA', '83%ile']].map(([s, p]) => (
          <div key={s} className="rounded-xl bg-stone-50 py-2">
            <p className="text-[10px] font-medium text-stone-400">{s}</p>
            <p className="text-sm font-bold text-stone-900">{p}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1.5">
        {ERRORS.map((e) => (
          <div key={e.label} className="flex items-center justify-between text-xs">
            <span className="text-stone-600">{e.label}</span>
            <span className={`rounded-full px-2 py-0.5 font-semibold ${e.tone}`}>{e.count}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl bg-purple-50 px-3 py-2">
        <p className="text-xs leading-relaxed text-purple-900">
          <span className="font-semibold">Buddy&apos;s note:</span> In DILR, 4 questions slipped purely because of
          time — the set selection was off, not your knowledge. This week: spend the first 5 minutes only on <em>choosing</em>
          {' '}the right set. QA is strong, so leave it as is.
        </p>
      </div>
    </div>
  );
}
