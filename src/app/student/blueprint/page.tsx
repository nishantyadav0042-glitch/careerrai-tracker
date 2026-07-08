'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { KNOWLEDGE_GRAPH, QA_GROUPS } from '@/lib/topics-constants';
import { RotatingBuddyBanner } from '@/components/rotating-buddy-banner';

interface WindowStats {
  daysStudied: number;
  tasksCompleted: number;
  minutesStudied: number;
  topicsTouched: number;
  sectionCounts: { VARC: number; DILR: number; QA: number; General: number };
  confidenceCounts: { green: number; yellow: number; red: number };
  mocksLogged: number;
}

interface PlanData {
  phase: { label: string; weekRange: string; objective: string };
  weeksRemaining: number;
  weakestSection: string | null;
  weakTopic: string | null;
  coverageTally: { not_started: number; learning: number; practicing: number; revising: number; exam_ready: number };
  prepMemory: {
    last30: WindowStats;
    mockTrend: { count: number; latestPercentile: number | null; previousPercentile: number | null };
  };
  healthScore: {
    status: 'provisional' | 'ready';
    score: number | null;
    components: { consistency: number; confidenceQuality: number; balance: number; revisionDiscipline: number } | null;
  };
  topicMemory: { topic: string; status: string; revisionOverdue: boolean; lastTouchedDaysAgo: number | null }[];
  hasBuddy: boolean;
  isPremium: boolean;
}

// Milestone groups: VARC, DILR, and the five QA clusters — real Knowledge
// Graph groupings, nothing invented.
const MILESTONE_GROUPS: { label: string; units: string[] }[] = [
  { label: 'VARC', units: KNOWLEDGE_GRAPH.find((s) => s.id === 'VARC')!.groups.flatMap((g) => g.units) },
  { label: 'DILR', units: KNOWLEDGE_GRAPH.find((s) => s.id === 'DILR')!.groups.flatMap((g) => g.units) },
  ...QA_GROUPS.map((g) => ({ label: g.label, units: g.units })),
];

// Founder words ("Strengthening phase") mean nothing to students — map the
// phase to what they actually DO in it.
function phaseWord(label: string): string {
  if (/foundation|concept|build/i.test(label)) return 'Learn + practice basics';
  if (/strength|practice|question/i.test(label)) return 'Practice questions';
  if (/sectional|intensive|mock/i.test(label)) return 'Sectionals + mocks';
  if (/revision|final|peak/i.test(label)) return 'Revise + mocks';
  return label;
}

// My CAT Plan — the owned asset. Home is today; this page is the journey.
// Every number is computed from the student's own declared + logged data.
export default function MyCatPlanPage() {
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchFailed(false);
    try {
      const res = await fetch('/api/blueprint');
      if (res.ok) setData(await res.json());
    } catch {
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
            onClick={load}
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

  const { phase, weeksRemaining, weakestSection, weakTopic, coverageTally, prepMemory, healthScore, topicMemory, hasBuddy, isPremium } = data;
  const { last30, mockTrend } = prepMemory;

  // Progress = exam units past "not started", out of the 46 exam units.
  const statusByTopic = new Map(topicMemory.map((t) => [t.topic, t.status]));
  const examUnits = MILESTONE_GROUPS.flatMap((g) => g.units);
  const inMotion = examUnits.filter((u) => (statusByTopic.get(u) ?? 'not_started') !== 'not_started').length;
  const progressPct = Math.round((inMotion / examUnits.length) * 100);

  // Next milestone: the group closest to done but not finished; if nothing
  // has started, start with Arithmetic (highest-weightage cluster).
  const groupStats = MILESTONE_GROUPS.map((g) => {
    const done = g.units.filter((u) => (statusByTopic.get(u) ?? 'not_started') !== 'not_started').length;
    return { label: g.label, done, total: g.units.length, ratio: done / g.units.length };
  });
  const unfinished = groupStats.filter((g) => g.ratio < 1).sort((a, b) => b.ratio - a.ratio);
  const milestone = unfinished.length === 0
    ? 'All topics in motion — revision mode'
    : unfinished[0].done === 0
    ? `Start ${groupStats.every((g) => g.done === 0) ? 'Arithmetic' : unfinished[0].label}`
    : `Finish ${unfinished[0].label} · ${unfinished[0].done}/${unfinished[0].total}`;

  const coverageTotal = coverageTally.not_started + coverageTally.learning + coverageTally.practicing + coverageTally.revising + coverageTally.exam_ready;
  const hasMemory = last30.tasksCompleted > 0 || mockTrend.count > 0;

  // ONE observation per page — a decision, not data. Priority-ordered rules
  // over real signals; the first that fires wins.
  const overdue = topicMemory.filter((t) => t.revisionOverdue);
  const stalest = [...overdue].sort((a, b) => (b.lastTouchedDaysAgo ?? 0) - (a.lastTouchedDaysAgo ?? 0))[0];
  const observation =
    mockTrend.count === 0 && weeksRemaining < 20
      ? 'Your plan sharpens a lot after your first mock. Take one this Sunday.'
      : stalest && stalest.lastTouchedDaysAgo != null
      ? `${stalest.topic} untouched for ${stalest.lastTouchedDaysAgo} days. Revise it this week.`
      : coverageTally.learning > coverageTally.practicing + coverageTally.revising && coverageTally.learning >= 5
      ? 'Enough basics in progress. Time to solve questions.'
      : inMotion > 0
      ? `${inMotion} topics in motion. Keep the pace.`
      : 'Start with Arithmetic. Highest weightage.';

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/student/tracker" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>My CAT Plan</h1>
        </div>

        {/* The journey, one glance */}
        <div className="bg-stone-900 rounded-2xl p-5">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400">Plan progress</p>
            <p className="text-sm font-bold text-white">{inMotion}/{examUnits.length} topics</p>
          </div>
          <div className="flex gap-0.5 mb-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className={`flex-1 h-2 first:rounded-l-sm last:rounded-r-sm ${i < Math.round((progressPct / 100) * 12) ? 'bg-orange-500' : 'bg-stone-700'}`} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Current focus</p>
              <p className="font-semibold text-white">{weakestSection ? `${weakestSection}${weakTopic ? ` · ${weakTopic}` : ''}` : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Now</p>
              <p className="font-semibold text-white">{phaseWord(phase.label)} · {weeksRemaining}w to CAT</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Next milestone</p>
              <p className="font-semibold text-white">{milestone}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Mocks</p>
              <p className="font-semibold text-white">{mockTrend.count > 0 ? `${mockTrend.count} logged · Sundays` : 'Sundays'}</p>
            </div>
          </div>
        </div>

        <Link href="/student/tracker" className="block rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">
          Today&apos;s Study Plan →
        </Link>

        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Today&apos;s observation</p>
          <p className="text-sm font-semibold text-stone-800">{observation}</p>
        </div>

        {/* Right after the student sees their own gap is the moment to show
            the fastest way to close it — not the first thing on the page. */}
        {!hasBuddy && !isPremium && <RotatingBuddyBanner />}

        {/* One Health score */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">On track?</h2>
          {healthScore.status === 'provisional' ? (
            <p className="text-sm text-stone-500">Unlocks after your first week.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-3xl font-bold text-stone-900">{healthScore.score}</span>
                <span className="text-sm text-stone-400">/ 100</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center border-t border-stone-100 pt-3">
                {([
                  [healthScore.components!.consistency, 35, 'Consistency'],
                  [healthScore.components!.confidenceQuality, 25, 'Confidence'],
                  [healthScore.components!.balance, 25, 'Balance'],
                  [healthScore.components!.revisionDiscipline, 15, 'Revision'],
                ] as const).map(([v, max, label]) => (
                  <div key={label}>
                    <p className="text-sm font-bold text-stone-800">{v}<span className="text-stone-400 font-normal">/{max}</span></p>
                    <p className="text-[10px] text-stone-400 leading-tight mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Topics — rows a student reads in five seconds */}
        {coverageTotal > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Topics</h2>
              <Link href="/student/analysis" className="text-xs font-semibold text-orange-600">Edit →</Link>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-stone-500">In motion</span><span className="font-bold text-stone-900">{inMotion}/{examUnits.length}</span></div>
              {coverageTally.revising + coverageTally.exam_ready > 0 && (
                <div className="flex justify-between"><span className="text-stone-500">Revision stage</span><span className="font-bold text-orange-600">{coverageTally.revising}</span></div>
              )}
              {overdue.length > 0 && (
                <div className="flex justify-between"><span className="text-stone-500">Revision pending</span><span className="font-bold text-red-600">{overdue.length}</span></div>
              )}
              {coverageTally.exam_ready > 0 && (
                <div className="flex justify-between"><span className="text-stone-500">Exam ready</span><span className="font-bold text-teal-600">{coverageTally.exam_ready}</span></div>
              )}
            </div>
          </div>
        )}

        {/* Last 30 days — facts only, hidden until real */}
        {hasMemory && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">Last 30 days</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-stone-900">{last30.daysStudied}</p>
                <p className="text-[10px] text-stone-400">Days</p>
              </div>
              <div>
                <p className="text-lg font-bold text-stone-900">{Math.round(last30.minutesStudied / 6) / 10}h</p>
                <p className="text-[10px] text-stone-400">Studied</p>
              </div>
              <div>
                <p className="text-lg font-bold text-stone-900">{last30.topicsTouched}</p>
                <p className="text-[10px] text-stone-400">Topics</p>
              </div>
            </div>
            {mockTrend.latestPercentile != null && (
              <p className="text-xs text-stone-600 border-t border-stone-100 pt-3 mt-3">
                Last mock: <span className="font-semibold">{mockTrend.latestPercentile}%ile</span>
                {mockTrend.previousPercentile != null && <> · was {mockTrend.previousPercentile}%ile</>}
              </p>
            )}
          </div>
        )}
        <div className="pb-16" />
      </div>
    </div>
  );
}
