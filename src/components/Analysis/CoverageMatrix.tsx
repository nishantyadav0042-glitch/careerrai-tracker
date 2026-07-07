'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

type Section = 'VARC' | 'DILR' | 'QA';
type Status = 'not_started' | 'started' | 'completed' | 'strong';

interface CoverageRow {
  section: Section;
  topic: string;
  status: Status;
}

const SECTION_ORDER: Section[] = ['VARC', 'DILR', 'QA'];

// One tap cycles a topic through this order — no dropdown, no modal, just
// tap-to-advance. Never Started -> Started -> Completed -> Strong -> back.
const STATUS_CYCLE: Status[] = ['not_started', 'started', 'completed', 'strong'];
const STATUS_LABEL: Record<Status, string> = {
  not_started: 'Never started',
  started: 'Started',
  completed: 'Completed',
  strong: 'Strong',
};
const STATUS_STYLE: Record<Status, string> = {
  not_started: 'bg-stone-100 text-stone-500 border-stone-200',
  started: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-teal-50 text-teal-700 border-teal-200',
  strong: 'bg-orange-50 text-orange-700 border-orange-300',
};

// The Coverage Matrix (Study Plan Generator Bible Part 4) — reuses the same
// 14-topic taxonomy already shown in daily logging, no second one invented.
// Shows exactly what the student declared in the Blueprint Builder (or
// not_started if they haven't) — never a stage-inferred guess. Each chip
// shows its status label, so the state is readable, not a color code.
export function CoverageMatrix() {
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/coverage');
      if (!res.ok) return;
      const json = (await res.json()) as { matrix: CoverageRow[] };
      setRows(json.matrix);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function cycleTopic(row: CoverageRow) {
    const key = `${row.section}:${row.topic}`;
    if (busy) return;
    setBusy(key);
    const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(row.status) + 1) % STATUS_CYCLE.length];
    // Optimistic — this is a low-stakes single-tap toggle, not worth a
    // round-trip delay before the chip visibly updates.
    setRows((prev) => prev.map((r) => (r.section === row.section && r.topic === row.topic ? { ...r, status: nextStatus } : r)));
    try {
      await fetch('/api/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: row.section, topic: row.topic, status: nextStatus }),
      });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-5 animate-pulse">
        <div className="h-4 w-32 bg-stone-200 rounded mb-3" />
        <div className="h-20 bg-stone-100 rounded" />
      </div>
    );
  }
  if (rows.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-1">Coverage Matrix</h2>
      <p className="text-xs text-stone-400 mb-4">Tap a topic to update it — cycles Never started → Started → Completed → Strong.</p>
      <div className="space-y-4">
        {SECTION_ORDER.map((section) => (
          <div key={section}>
            <p className="text-xs font-bold text-stone-700 mb-1.5">{section}</p>
            <div className="flex flex-wrap gap-1.5">
              {rows.filter((r) => r.section === section).map((row) => {
                const key = `${row.section}:${row.topic}`;
                return (
                  <button
                    key={key}
                    onClick={() => cycleTopic(row)}
                    disabled={busy === key}
                    title={STATUS_LABEL[row.status]}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all active:scale-95',
                      STATUS_STYLE[row.status],
                      busy === key && 'opacity-50'
                    )}
                  >
                    {row.topic}
                    <span className="ml-1 opacity-70 font-normal">· {STATUS_LABEL[row.status]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
