import type { DaySnapshot } from '@/lib/sales-yesterday';

// ── THE REP'S MORNING MIRROR (founder order, 3 Sep) ─────────────────────────
//
// Yesterday's OWN work at the top of the rep workspace, every open, all day:
// dispositions made, students touched, the outcome split, callbacks promised,
// remarks actually typed. The PAGE computes the snapshot (via the same
// function the founder's Control Tower compiles, so the two views can never
// disagree) and hands it here; this component only renders. Sync on purpose -
// a nested async server component suspends under renderToStaticMarkup, which
// is how the /sales render tests caught the first version of this file.
//
// A zero renders as a zero, deliberately. "How much was NOT done" is half of
// what was asked for, so the card never hides itself when attempts === 0.

export const OUTCOME_LABEL: Record<string, string> = {
  interested: 'Interested',
  callback: 'Callback set',
  converted: 'Converted',
  not_interested: 'Not interested',
  dnd: 'DND',
  no_answer: 'No answer',
  messaged: 'Messaged',
  skipped: 'Skipped',
};

const OUTCOME_TONE: Record<string, string> = {
  interested: 'bg-amber-50 text-amber-800 border-amber-200',
  callback: 'bg-sky-50 text-sky-800 border-sky-200',
  converted: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  not_interested: 'bg-stone-100 text-stone-600 border-stone-200',
  dnd: 'bg-rose-50 text-rose-700 border-rose-200',
  no_answer: 'bg-orange-50 text-orange-700 border-orange-200',
  messaged: 'bg-lime-50 text-lime-800 border-lime-200',
  skipped: 'bg-stone-100 text-stone-500 border-stone-200',
};

export function SnapshotChips({ s }: { s: Pick<DaySnapshot, 'byOutcome'> }) {
  const entries = Object.keys(OUTCOME_LABEL)
    .filter((k) => (s.byOutcome[k] ?? 0) > 0)
    .map((k) => [k, s.byOutcome[k]] as const);
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span key={k} className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${OUTCOME_TONE[k] ?? 'bg-stone-100 text-stone-600 border-stone-200'}`}>
          {v} {OUTCOME_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

export function YesterdayFlash({ s }: { s: DaySnapshot }) {
  return (
    <div className="mb-3 rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Yesterday, in your own numbers
        </h2>
        <span className="text-[11px] text-stone-400">{s.label} · self-reported</span>
      </div>
      {s.attempts === 0 ? (
        <p className="mt-1.5 text-[13px] text-stone-600">
          No dispositions were recorded yesterday. If you worked, it isn&apos;t on the record — and only the record counts.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-[13px] text-stone-700">
            <strong>{s.attempts}</strong> dispositions across <strong>{s.studentsTouched}</strong> students
            {' · '}<strong>{s.callbacksSet}</strong> callbacks promised
            {' · '}<strong>{s.remarksTyped}</strong> remarks in your own words
          </p>
          <SnapshotChips s={s} />
        </>
      )}
    </div>
  );
}
