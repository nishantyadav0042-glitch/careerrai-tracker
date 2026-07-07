'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { KNOWLEDGE_GRAPH, TOPIC_METADATA } from '@/lib/topics-constants';

type Status = 'not_started' | 'learning' | 'practicing' | 'revising' | 'exam_ready';

interface CoverageRow {
  section: string;
  topic: string;
  status: Status;
  updated_at: string;
}

// Student-controlled cycle only — exam_ready (🟢) is earned through
// confidence signals on completed tasks, never set by a tap here, and
// tapping an exam_ready topic deliberately does nothing (the system gave
// that status; the system takes it away via a red confidence signal).
const STUDENT_CYCLE: Status[] = ['not_started', 'learning', 'practicing', 'revising'];

// The mastery ring: one glyph per state, growth you can see — more
// motivating than a percentage and honest about who set it.
const STATUS_GLYPH: Record<Status, string> = {
  not_started: '○',
  learning: '◔',
  practicing: '◑',
  revising: '◕',
  exam_ready: '⬤',
};
const STATUS_LABEL: Record<Status, string> = {
  not_started: 'Not started',
  learning: 'Learning',
  practicing: 'Practicing',
  revising: 'Revision started',
  exam_ready: 'Exam ready',
};
const STATUS_STYLE: Record<Status, string> = {
  not_started: 'bg-stone-100 text-stone-500 border-stone-200',
  learning: 'bg-amber-50 text-amber-700 border-amber-200',
  practicing: 'bg-blue-50 text-blue-700 border-blue-200',
  revising: 'bg-orange-50 text-orange-700 border-orange-200',
  exam_ready: 'bg-teal-50 text-teal-700 border-teal-300',
};
// Derived, never stored: a practicing/exam_ready topic past its revision
// cadence shows ◕ Revision due in place of its normal state.
const REVISION_DUE_STYLE = 'bg-orange-50 text-orange-700 border-orange-300';

function isRevisionDue(row: CoverageRow): boolean {
  if (row.status !== 'practicing' && row.status !== 'revising' && row.status !== 'exam_ready') return false;
  const meta = TOPIC_METADATA[row.topic];
  if (!meta) return false;
  const daysSince = Math.round((Date.now() - Date.parse(row.updated_at)) / 86_400_000);
  return daysSince > meta.revisionFrequencyDays;
}

// The preparation map (Knowledge Graph coverage) — shows exactly what the
// student declared in the Blueprint Builder plus what the system has since
// upgraded, grouped the way the graph defines it.
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
    if (row.status === 'exam_ready') return; // system-earned, not tappable
    const key = `${row.section}:${row.topic}`;
    if (busy) return;
    setBusy(key);
    const nextStatus = STUDENT_CYCLE[(STUDENT_CYCLE.indexOf(row.status) + 1) % STUDENT_CYCLE.length];
    // Optimistic — a low-stakes single-tap toggle, not worth a round-trip delay.
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

  const rowsByTopic = new Map(rows.map((r) => [r.topic, r]));

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-1">Preparation Map</h2>
      <p className="text-xs text-stone-400 mb-4">
        Tap to update: ○ Not started → ◔ Learning → ◑ Practicing → ◕ Revising. ⬤ Exam ready is earned, not tapped; an orange chip means revision is due.
      </p>
      <div className="space-y-4">
        {KNOWLEDGE_GRAPH.map((section) => {
          const sectionRows = section.groups.flatMap((g) => g.units).map((u) => rowsByTopic.get(u)).filter((r): r is CoverageRow => r != null);
          if (sectionRows.length === 0) return null;
          return (
            <div key={section.id}>
              <p className="text-xs font-bold text-stone-700 mb-1.5">{section.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {sectionRows.map((row) => {
                  const key = `${row.section}:${row.topic}`;
                  const revDue = isRevisionDue(row);
                  return (
                    <button
                      key={key}
                      onClick={() => cycleTopic(row)}
                      disabled={busy === key}
                      title={revDue ? 'Revision due' : STATUS_LABEL[row.status]}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all active:scale-95',
                        revDue ? REVISION_DUE_STYLE : STATUS_STYLE[row.status],
                        busy === key && 'opacity-50',
                        row.status === 'exam_ready' && 'cursor-default'
                      )}
                    >
                      <span className="mr-1">{revDue ? '◕' : STATUS_GLYPH[row.status]}</span>
                      {row.topic}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
