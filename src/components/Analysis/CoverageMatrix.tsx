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
  is_priority?: boolean | null;
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
// Colour is a simple traffic light, not a per-status rainbow: grey = not
// begun, amber = in progress (the pie glyph ○◔◑◕ still shows how far along),
// green = exam-ready, red = revision due. One colour = one meaning, so the
// map reads at a glance instead of asking "what does blue mean again?".
const STATUS_STYLE: Record<Status, string> = {
  not_started: 'bg-stone-100 text-stone-500 border-stone-200',
  learning: 'bg-amber-50 text-amber-700 border-amber-300',
  practicing: 'bg-amber-50 text-amber-700 border-amber-300',
  revising: 'bg-amber-50 text-amber-700 border-amber-300',
  exam_ready: 'bg-emerald-50 text-emerald-700 border-emerald-300',
};
const REVISION_DUE_STYLE = 'bg-red-50 text-red-700 border-red-300';

// The legend: four colours, one line each. Filled dots (not the pie glyphs)
// so the colour itself is what's being taught here.
const LEGEND: { dot: string; label: string }[] = [
  { dot: 'bg-stone-300', label: 'Not started' },
  { dot: 'bg-amber-400', label: 'In progress' },
  { dot: 'bg-emerald-500', label: 'Exam ready' },
  { dot: 'bg-red-500', label: 'Revision due' },
];

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

  // Star a topic to schedule it first (student ask: "complete Arithmetic
  // first"). Optimistic; the API caps at 5 and we roll back on rejection.
  async function togglePriority(row: CoverageRow) {
    const next = !(row.is_priority === true);
    setRows((prev) => prev.map((r) => (r.topic === row.topic ? { ...r, is_priority: next } : r)));
    const res = await fetch('/api/coverage/priority', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: row.topic, priority: next }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setRows((prev) => prev.map((r) => (r.topic === row.topic ? { ...r, is_priority: !next } : r)));
      const json = res ? await res.json().catch(() => ({})) : {};
      if (json?.error) alert(json.error);
    }
  }

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
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-5 text-center space-y-1.5">
        <p className="text-sm font-semibold text-stone-800">Your preparation map isn&apos;t built yet</p>
        <p className="text-xs text-stone-500">
          Mark what you&apos;ve covered on the Home tab and it&apos;ll show up here — section by section.
        </p>
      </div>
    );
  }

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
        const starred = row.is_priority === true;
        return (
          <div
            key={key}
            className={cn(
              'inline-flex min-h-[32px] items-center rounded-full border text-[11px] font-medium transition-all',
              revDue ? REVISION_DUE_STYLE : STATUS_STYLE[row.status],
              starred && 'ring-2 ring-violet-300',
              busy === key && 'opacity-50'
            )}
          >
            <button
              onClick={() => cycleTopic(row)}
              disabled={busy === key}
              title={revDue ? 'Revision due' : STATUS_LABEL[row.status]}
              className={cn('py-1.5 pl-3 pr-1 active:scale-95 transition-transform', row.status === 'exam_ready' && 'cursor-default')}
            >
              <span className="mr-1">{STATUS_GLYPH[row.status]}</span>
              {row.topic}
            </button>
            {/* Star = schedule this first. Separate tap target from the
                status cycle so prioritising never mis-taps a status change. */}
            <button
              onClick={() => togglePriority(row)}
              aria-label={starred ? `Remove ${row.topic} from priorities` : `Prioritise ${row.topic}`}
              title={starred ? 'Priority — scheduled first' : 'Star to schedule first'}
              className={cn('py-1.5 pl-0.5 pr-2 text-[13px] leading-none active:scale-90 transition-transform', starred ? 'opacity-100' : 'opacity-35 hover:opacity-70')}
            >
              {starred ? '★' : '☆'}
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-1">Preparation Map</h2>
      <p className="text-xs text-stone-400 mb-2.5">Tap a section, then tap a topic to move it forward.</p>
      {/* Colour legend — the `title` tooltip on each chip never fires on a
          mobile tap, so the colour meaning has to live here as text. One
          colour, one meaning: grey → amber → green, red when revision is due. */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 mb-1.5">
        {LEGEND.map((it) => (
          <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-600">
            <span className={cn('h-2.5 w-2.5 rounded-full', it.dot)} />
            {it.label}
          </span>
        ))}
      </div>
      <p className="mb-3 text-[10px] leading-relaxed text-stone-400">
        The dot fills — ○ ◔ ◑ ◕ — as a topic moves from just started to revision. Green is earned from your results, not a tap.
        {' '}Tap ★ on up to 5 topics to get them scheduled first in your daily plan.
      </p>
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
