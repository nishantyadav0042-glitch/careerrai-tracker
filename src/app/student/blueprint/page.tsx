'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { BuddyBanner } from '@/components/buddy-banner';
import type { BuddyBanner as BuddyBannerData } from '@/lib/buddy-banner';
import { WeekPlan } from '@/components/week-plan';
import type { DayPlan } from '@/lib/study-forecast';

interface ThisWeekItem { label: string; href: string }
interface FinishProjection {
  status: 'done' | 'stalled' | 'ahead' | 'tight' | 'critical';
  windowLabel: string | null;
  sub: string;
}
interface RoadmapDates {
  mockIntensiveStart: string;
  revisionSprintStart: string;
}
interface PlanData {
  totalTopics: number;
  studiedOnceCount: number;
  learningCount: number;
  notStartedCount: number;
  weekPlan: DayPlan[];
  dueForRevisionCount: number;
  mocksCompleted: number;
  finishProjection: FinishProjection;
  roadmapDates: RoadmapDates;
  thisWeek: ThisWeekItem[];
  biggestPriority: string | null;
  hasBuddy: boolean;
  isPremium: boolean;
  buddyBanner: BuddyBannerData;
}

// Pure B&W: the ✓ / ⚠ glyph carries the signal, not colour.
const VERDICT: Record<FinishProjection['status'], { label: string; color: string } | null> = {
  done: { label: '✓ Syllabus done', color: 'text-stone-900' },
  ahead: { label: '✓ On track', color: 'text-stone-900' },
  tight: { label: '⚠ Tight', color: 'text-stone-600' },
  critical: { label: '⚠ Behind', color: 'text-stone-900 font-bold' },
  stalled: null,
};

function PlanRow({ href, icon, label, cta }: { href: string; icon: string; label: string; cta: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-stone-50 transition-colors">
      <span className="text-lg w-6 text-center shrink-0">{icon}</span>
      <span className="flex-1 text-sm font-semibold text-stone-800">{label}</span>
      <span className="text-xs font-bold text-stone-900 whitespace-nowrap">{cta} →</span>
    </Link>
  );
}

// My CAT Plan — four questions, ten seconds: what have I studied, what's due,
// what's left, and when does the syllabus finish. Every number reads off the
// same engines the rest of the app already trusts (topic memory, mock trend,
// roadmap phase) — nothing on this page is computed just for this page.
export default function MyCatPlanPage() {
  // React Query with a 30s staleTime — a student bouncing tracker ↔ plan
  // used to pay the full /api/blueprint round-trip (the heaviest student
  // API) on every visit; within 30s it now renders instantly from memory.
  // Same freshness rule as the streak/log queries in useLogging.ts.
  const { data, isLoading, isError, refetch } = useQuery<PlanData>({
    queryKey: ['blueprint'],
    queryFn: async () => {
      const res = await fetch('/api/blueprint');
      if (!res.ok) throw new Error(`blueprint fetch failed: ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });
  const loading = isLoading;
  const fetchFailed = isError;
  const load = refetch;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-stone-500">Loading your plan…</div>
      </div>
    );
  }
  if (fetchFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-sm text-stone-500">Couldn&apos;t load your plan — check your connection.</p>
          <button
            type="button"
            onClick={() => load()}
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-sm text-stone-500">Build your CAT Plan first — it starts on the Home tab.</p>
      </div>
    );
  }

  const {
    totalTopics, studiedOnceCount, learningCount, notStartedCount, dueForRevisionCount, mocksCompleted,
    finishProjection, roadmapDates, thisWeek, biggestPriority, hasBuddy, isPremium, buddyBanner, weekPlan,
  } = data;
  const verdict = VERDICT[finishProjection.status];

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/student/tracker" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>My CAT Plan</h1>
            <p className="text-sm text-stone-500">Your preparation today</p>
          </div>
        </div>

        {/* Studied through / in progress / due revision / not started / mocks.
            'In progress' (learning) is its own row so a student who has merely
            opened topics sees real next actions instead of a false "done". */}
        <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100 overflow-hidden">
          <PlanRow href="/student/analysis" icon="✅" label={`${studiedOnceCount}/${totalTopics} studied once`} cta="View" />
          {learningCount > 0 && (
            <PlanRow href="/student/analysis" icon="📖" label={`${learningCount} in progress`} cta="Continue" />
          )}
          {/* Revision only appears once something is ACTUALLY due — a brand-new
              student who hasn't studied anything should never see a "0 due for
              revision" line implying they're behind on revision they never started. */}
          {dueForRevisionCount > 0 && (
            <PlanRow href="/student/analysis" icon="🔄" label={`${dueForRevisionCount} due for revision`} cta="View" />
          )}
          <PlanRow href="/student/analysis" icon="⚪" label={`${notStartedCount} not started`} cta="Start" />
          {/* Same logic for mocks — no "0 mocks completed" noise before the first one. */}
          {mocksCompleted > 0 && (
            <PlanRow
              href="/student/analysis?tab=mocks"
              icon="📝"
              label={`${mocksCompleted} mock${mocksCompleted === 1 ? '' : 's'} completed`}
              cta="View"
            />
          )}
        </div>

        {/* The road ahead — next several days, topic by topic, at their pace. */}
        <WeekPlan plan={weekPlan} />

        {/* "Can I still finish?" — a real date window from trailing pace,
            paired with two fixed calendar facts (Mock Intensive / Revision
            Sprint start dates come straight from the roadmap's own
            thresholds, not from pace — nothing here is projected twice).
            The verdict badge is the same status the sub-line already
            implies; it's a lever, never a scolding. */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Finish syllabus</p>
            {verdict && <span className={`text-xs font-bold ${verdict.color}`}>{verdict.label}</span>}
          </div>
          {finishProjection.windowLabel ? (
            <>
              <p className="text-lg font-bold text-stone-900">{finishProjection.windowLabel}</p>
              <p className="text-xs text-stone-500 mt-0.5">{finishProjection.sub}</p>
            </>
          ) : (
            <p className="text-sm font-semibold text-stone-800">{finishProjection.sub}</p>
          )}
          <div className="grid grid-cols-2 gap-3 border-t border-stone-100 mt-3 pt-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-0.5">Mock Intensive begins</p>
              <p className="text-sm font-semibold text-stone-800">{roadmapDates.mockIntensiveStart}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-0.5">Revision Sprint begins</p>
              <p className="text-sm font-semibold text-stone-800">{roadmapDates.revisionSprintStart}</p>
            </div>
          </div>
        </div>

        {thisWeek.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2.5">This week</h2>
            <div className="space-y-2">
              {thisWeek.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-2.5 text-sm font-semibold text-stone-800 hover:text-stone-950"
                >
                  <span className="text-stone-900">✓</span>{item.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* One diagnosis, or none — never a generic filler line. */}
        {biggestPriority && (
          <div className="rounded-2xl border-2 border-stone-900 bg-stone-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1">Biggest priority</p>
            <p className="text-sm font-semibold text-stone-900">{biggestPriority}</p>
          </div>
        )}

        {!hasBuddy && !isPremium && <BuddyBanner banner={buddyBanner} />}

        <div className="pb-16" />
      </div>
    </div>
  );
}
