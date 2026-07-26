'use client';

import { STATUS_LABEL } from '@/lib/coverage-status';
import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
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
                  return (
                    <div key={t.topic} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm font-medium text-stone-800">{t.topic}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          t.revisionOverdue ? 'bg-red-100 text-red-600' : pill.cls
                        }`}
                      >
                        {t.revisionOverdue ? 'Revision due' : pill.label}
                      </span>
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
