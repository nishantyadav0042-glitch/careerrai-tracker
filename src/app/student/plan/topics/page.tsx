'use client';

import { STATUS_LABEL } from '@/lib/coverage-status';
import { Suspense, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { PreparationCard } from '@/components/preparation-card';

// The topic lists behind the "My CAT Plan" doors (founder, 24 Jul: the doors
// used to dump you on the Analysis page with zero info — each should open
// exactly the topics in that bucket, by name). Reads the SAME topicMemory the
// blueprint counts read (shared react-query cache key), so the count on the
// door always equals the list length here.

type Status = 'not_started' | 'learning' | 'practicing' | 'revising' | 'exam_ready';
interface TopicMem { topic: string; status: Status; revisionOverdue?: boolean }
interface BlueprintData { topicMemory: TopicMem[] }

const SECTION_ORDER = ['QA', 'DILR', 'VARC'] as const;

// ── Correcting your own record ──────────────────────────────────────────────
//
// Backbone audit, 13 Aug: coverage could only ever move FORWARD. The daily
// tick advances it, the weekly review is forward-only by design, and the two
// escape hatches the code promised — the red confidence signal and "the full
// matrix editor" — did not exist: the red signal has no UI anywhere, and this
// page, the matrix, was read-only. So a student who genuinely forgot a topic
// had no way to say so, and the planner kept believing a chapter was done.
//
// This is that door, and it belongs HERE rather than in a daily flow: the
// student has navigated to their coverage map and tapped one named topic on
// purpose. That is the "deliberate flow" the forward-only rule always carved
// out for (see coverage-status.isForwardMove) — a mis-tap on the home screen
// would rewrite history, a considered tap on this page is the student
// correcting it.
//
// exam_ready is absent on purpose. It is earned from evidence and can never be
// self-assigned; the API refuses it too (validateCoverageEntry).
const EDITABLE: Status[] = ['not_started', 'learning', 'practicing', 'revising'];

// Colours are local presentation; the LABEL TEXT comes from the canonical
// ladder (coverage-status.STATUS_LABEL) so this page can never say
// "Practicing" while the weekly review says "Practising" for the same status.
const STATUS_CLS: Record<Status, string> = {
  not_started: 'bg-stone-100 text-stone-500',
  learning:    'bg-amber-100 text-amber-700',
  practicing:  'bg-amber-100 text-amber-700',
  revising:    'bg-amber-100 text-amber-700',
  exam_ready:  'bg-emerald-100 text-emerald-700',
};
const STATUS_PILL: Record<Status, { label: string; cls: string }> = Object.fromEntries(
  (Object.keys(STATUS_CLS) as Status[]).map((k) => [k, { label: STATUS_LABEL[k], cls: STATUS_CLS[k] }]),
) as Record<Status, { label: string; cls: string }>;

const VIEWS = {
  finished:    { title: 'Finished',              sub: 'studied through at least once', match: (t: TopicMem) => t.status === 'practicing' || t.status === 'revising' || t.status === 'exam_ready' },
  learning:    { title: 'Started, not finished', sub: 'pick these up next',            match: (t: TopicMem) => t.status === 'learning' },
  not_started: { title: 'Not started',           sub: 'yet to begin',                  match: (t: TopicMem) => t.status === 'not_started' },
  remaining:   { title: 'Left to finish',        sub: 'not started + in progress',     match: (t: TopicMem) => t.status === 'not_started' || t.status === 'learning' },
  revision:    { title: 'Due for revision',      sub: 'studied, now going cold',       match: (t: TopicMem) => t.revisionOverdue === true },
} as const;
type ViewKey = keyof typeof VIEWS;

function TopicsInner() {
  const params = useSearchParams();
  const key = (params.get('status') ?? 'remaining') as ViewKey;
  const view = VIEWS[key] ?? VIEWS.remaining;

  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function setStatus(t: TopicMem, status: Status) {
    if (saving) return;
    setSaving(t.topic);
    setSaveError(null);
    try {
      const section = TOPIC_METADATA[t.topic]?.section;
      const res = await fetch('/api/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, topic: t.topic, status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveError(body.error ?? 'Could not save — try again.');
        return;
      }
      setEditing(null);
      // The plan reads this table, so every surface built on it must re-read.
      await queryClient.invalidateQueries({ queryKey: ['blueprint'] });
    } catch {
      setSaveError('Could not save — check your connection.');
    } finally {
      setSaving(null);
    }
  }

  const { data, isLoading } = useQuery<BlueprintData>({
    queryKey: ['blueprint'],
    queryFn: async () => {
      const res = await fetch('/api/blueprint');
      if (!res.ok) throw new Error('blueprint fetch failed');
      return res.json();
    },
    staleTime: 30_000,
  });

  const topics = (data?.topicMemory ?? []).filter(view.match);
  const bySection = SECTION_ORDER.map((sec) => ({
    section: sec,
    items: topics
      .filter((t) => TOPIC_METADATA[t.topic]?.section === sec)
      .sort((a, b) => (TOPIC_METADATA[b.topic]?.weightage ?? 0) - (TOPIC_METADATA[a.topic]?.weightage ?? 0)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/student/blueprint" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>{view.title}</h1>
            <p className="text-sm text-stone-500">
              {isLoading ? 'Loading…' : `${topics.length} topic${topics.length === 1 ? '' : 's'} · ${view.sub}`}
            </p>
          </div>
        </div>

        {/* The honest four before the topic list, so a student reads what the
            statuses below are actually worth before reading the statuses. */}
        <PreparationCard />

        {isLoading ? (
          <div className="py-10 text-center text-sm text-stone-500">Loading your topics…</div>
        ) : topics.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
            <p className="text-sm text-stone-500">Nothing here right now.</p>
          </div>
        ) : (
          bySection.map(({ section, items }) => (
            <div key={section} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
              <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
                <span className="text-sm font-bold text-stone-800">{section}</span>
                <span className="text-xs font-semibold text-stone-500">{items.length}</span>
              </div>
              <div className="divide-y divide-stone-100">
                {items.map((t) => {
                  const pill = STATUS_PILL[t.status];
                  const open = editing === t.topic;
                  return (
                    <div key={t.topic}>
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-sm font-medium text-stone-800">{t.topic}</span>
                        <button
                          type="button"
                          onClick={() => { setEditing(open ? null : t.topic); setSaveError(null); }}
                          aria-label={`Change status: ${t.topic}`}
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold transition-transform active:scale-95 ${
                            t.revisionOverdue ? 'bg-red-100 text-red-600' : pill.cls
                          }`}
                        >
                          {t.revisionOverdue ? 'Revision due' : pill.label} ▾
                        </button>
                      </div>
                      {open && (
                        <div className="bg-stone-50 px-4 pb-3 pt-1">
                          <p className="mb-1.5 text-[11px] font-semibold text-stone-500">
                            Where are you really on {t.topic}?
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {EDITABLE.map((s) => (
                              <button
                                key={s}
                                type="button"
                                disabled={saving != null}
                                onClick={() => void setStatus(t, s)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-transform active:scale-95 disabled:opacity-50 ${
                                  t.status === s ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700'
                                }`}
                              >
                                {STATUS_LABEL[s]}
                              </button>
                            ))}
                          </div>
                          <p className="mt-1.5 text-[10.5px] text-stone-400">
                            Moving it back is fine — tomorrow&apos;s plan picks it up again.
                          </p>
                          {saveError && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">{saveError}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function PlanTopicsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-stone-500">Loading…</div>}>
      <TopicsInner />
    </Suspense>
  );
}
