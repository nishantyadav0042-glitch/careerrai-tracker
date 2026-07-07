'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
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
// confidence signals, never set by a tap here.
const STUDENT_CYCLE: Status[] = ['not_started', 'learning', 'practicing', 'revising'];

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
const REVISION_DUE_STYLE = 'bg-red-50 text-red-700 border-red-300';

function isRevisionDue(row: CoverageRow): boolean {
  if (row.status !== 'practicing' && row.status !== 'revising' && row.status !== 'exam_ready') return false;
  const meta = TOPIC_METADATA[row.topic];
  if (!meta) return false;
  const daysSince = Math.round((Date.now() - Date.parse(row.updated_at)) / 86_400_000);
  return daysSince > meta.revisionFrequencyDays;
}

// Progressive disclosure — sections collapsed with a % headline, depth only
// on tap. Never all 53 units at once (the Google-Maps-zoomed-to-Earth
// problem). Section header = a conclusion; chips = the detail.
export function CoverageMatrix() {
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

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

  // Section headline: one conclusion — % in motion, or "revision due".
  const summarize = (units: string[]) => {
    const unitRows = units.map((u) => rowsByTopic.get(u)).filter((r): r is CoverageRow => r != null);
    const inMotion = unitRows.filter((r) => r.status !== 'not_started').length;
    const due = unitRows.filter(isRevisionDue).length;
    const pct = unitRows.length > 0 ? Math.round((inMotion / unitRows.length) * 100) : 0;
    return { pct, due, count: unitRows.length };
  };

  const renderChips = (units: string[]) => (
    <div className="flex flex-wrap gap-1.5 p-2.5">
      {units.map((u) => rowsByTopic.get(u)).filter((r): r is CoverageRow => r != null).map((row) => {
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
            <span className="mr-1">{STATUS_GLYPH[row.status]}</span>
            {row.topic}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-1">Preparation Map</h2>
      <p className="text-xs text-stone-400 mb-3">Tap a section, then tap a topic to update it. ⬤ is earned, red means revision due.</p>
      <div className="space-y-2">
        {KNOWLEDGE_GRAPH.map((section) => {
          const allUnits = section.groups.flatMap((g) => g.units);
          const stat = summarize(allUnits);
          if (stat.count === 0) return null;
          const isOpen = openSection === section.id;
          return (
            <div key={section.id} className="rounded-xl border border-stone-200 overflow-hidden">
              <button
                onClick={() => setOpenSection(isOpen ? null : section.id)}
                className="w-full flex items-center justify-between px-3.5 py-3 bg-stone-50 hover:bg-stone-100 transition-colors"
              >
                <span className="text-sm font-bold text-stone-800">{section.label}</span>
                <span className="flex items-center gap-2 text-[11px]">
                  <span className="font-bold text-stone-700">{stat.pct}%</span>
                  {stat.due > 0 && <span className="font-semibold text-red-600">{stat.due} due</span>}
                  <ChevronDown className={cn('w-4 h-4 text-stone-400 transition-transform', isOpen && 'rotate-180')} />
                </span>
              </button>
              {isOpen && (
                section.groups.length === 1 && section.groups[0].label == null ? (
                  renderChips(section.groups[0].units)
                ) : (
                  <div className="p-2 space-y-1.5">
                    {section.groups.map((group) => {
                      const gStat = summarize(group.units);
                      const gOpen = !!openGroups[group.label!];
                      return (
                        <div key={group.label} className="rounded-lg border border-stone-100 overflow-hidden">
                          <button
                            onClick={() => setOpenGroups((prev) => ({ ...prev, [group.label!]: !gOpen }))}
                            className="w-full flex items-center justify-between px-3 py-2 bg-white hover:bg-stone-50"
                          >
                            <span className="text-xs font-bold text-stone-600">{group.label}</span>
                            <span className="flex items-center gap-2 text-[10px]">
                              <span className="font-bold text-stone-600">{gStat.pct}%</span>
                              {gStat.due > 0 && <span className="font-semibold text-red-600">{gStat.due} due</span>}
                              <ChevronDown className={cn('w-3.5 h-3.5 text-stone-400 transition-transform', gOpen && 'rotate-180')} />
                            </span>
                          </button>
                          {gOpen && renderChips(group.units)}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
