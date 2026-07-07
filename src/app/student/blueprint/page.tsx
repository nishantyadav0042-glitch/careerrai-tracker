'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Flame } from 'lucide-react';
import Link from 'next/link';

interface WindowStats {
  daysStudied: number;
  tasksCompleted: number;
  minutesStudied: number;
  topicsTouched: number;
  sectionCounts: { VARC: number; DILR: number; QA: number; General: number };
  confidenceCounts: { green: number; yellow: number; red: number };
  mocksLogged: number;
}

interface BlueprintData {
  narrative: string;
  source: 'ai' | 'fallback';
  phase: { label: string; weekRange: string; objective: string; dailyFocus: string; weeklyFocus: string };
  weeksRemaining: number;
  weakestSection: string | null;
  weakTopic: string | null;
  currentStage: string | null;
  biggestBlocker: string | null;
  coverageTally: { not_started: number; started: number; completed: number; strong: number };
  currentStreak: number;
  targetPercentile: number | null;
  prepMemory: {
    last30: WindowStats;
    last7: WindowStats;
    mockTrend: { count: number; latestPercentile: number | null; previousPercentile: number | null };
  };
  weeklyEvolution: string[];
  healthScore: {
    status: 'provisional' | 'ready';
    score: number | null;
    components: { consistency: number; confidenceQuality: number; balance: number; revisionDiscipline: number } | null;
  };
  blueprintConfidence: { score: number; reasons: string[] };
  topicMemory: {
    topic: string;
    status: string;
    firstTouchedDaysAgo: number | null;
    timesTouched: number;
    lastTouchedDaysAgo: number | null;
    revisionOverdue: boolean;
  }[];
}

const STAGE_LABEL: Record<string, string> = {
  not_started: "Haven't started",
  concepts: 'Learning concepts',
  questions: 'Solving questions',
  sectionals: 'Taking sectionals',
  mocks: 'Taking full mocks',
};
const BLOCKER_LABEL: Record<string, string> = {
  inconsistency: "Staying consistent",
  dont_know_what: 'Knowing what to study',
  mock_anxiety: 'Mock anxiety',
  time_wasting: 'Time management',
};

// The Study Blueprint — deliberately a different screen from Today's
// Routine, not a rename of it. Every fact here is already decided by the
// deterministic engines (routine-engine, mission-engine, study-plan); the
// narrative line only organizes and phrases them (same "explain, never
// decide" boundary as the buddy briefing) — it never proposes its own plan.
const STATUS_LABEL: Record<string, string> = {
  not_started: 'Never studied',
  started: 'Studying',
  completed: 'Completed once',
  strong: 'Strong',
};

function memoryLine(entry: BlueprintData['topicMemory'][number]): string {
  if (entry.firstTouchedDaysAgo == null) {
    // No logged practice in the app. The status can still be completed/
    // strong/started — that's the student's own Blueprint declaration, not
    // app history, so say exactly that instead of contradicting the badge
    // ("Completed once" next to "haven't started this yet").
    if (entry.status === 'completed' || entry.status === 'strong') return 'You marked this covered before joining — no practice logged in the app yet.';
    if (entry.status === 'started') return 'You marked this in progress — no practice logged in the app yet.';
    return "Haven't started this yet.";
  }
  const parts = [`First studied ${entry.firstTouchedDaysAgo}d ago`];
  if (entry.timesTouched > 1) parts.push(`revisited ${entry.timesTouched - 1}x`);
  if (entry.lastTouchedDaysAgo != null) parts.push(`last touched ${entry.lastTouchedDaysAgo}d ago`);
  if (entry.revisionOverdue) parts.push('revision overdue');
  return parts.join(' · ');
}

export default function BlueprintPage() {
  const [data, setData] = useState<BlueprintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [memorySearch, setMemorySearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/blueprint');
        if (res.ok) setData(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-stone-500">Loading your blueprint…</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-sm text-stone-500">Complete today&apos;s setup on the Home tab first — your blueprint builds from that.</p>
      </div>
    );
  }

  const { narrative, phase, weeksRemaining, weakestSection, weakTopic, currentStage, biggestBlocker, coverageTally, currentStreak, targetPercentile, prepMemory, weeklyEvolution, healthScore, blueprintConfidence, topicMemory } = data;
  const filteredMemory = topicMemory.filter((m) => m.topic.toLowerCase().includes(memorySearch.toLowerCase()));
  const coverageTotal = coverageTally.not_started + coverageTally.started + coverageTally.completed + coverageTally.strong;
  const { last30, mockTrend } = prepMemory;
  const hasMemory = last30.tasksCompleted > 0 || mockTrend.count > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/student/tracker" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Your Study Blueprint</h1>
            <p className="text-sm text-stone-500">The plan, not just today&apos;s task list</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <p className="text-sm text-stone-800 leading-relaxed">{narrative}</p>
          {currentStreak > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500">
              <Flame className="w-3.5 h-3.5 text-orange-500" />{currentStreak}-day streak
            </p>
          )}
        </div>

        {/* Preparation Health — ONE composite number, not a multi-metric
            dashboard: Consistency + Confidence quality + Balance + Revision
            discipline, rolling 30 days. Confidence quality is what keeps this
            from measuring pure activity — showing up every day tapping "lost"
            on everything scores lower than showing up less but improving.
            Provisional (no number) under a week of history — a score from 2
            days of data would be worse than no score. */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">Preparation health</h2>
          {healthScore.status === 'provisional' ? (
            <p className="text-sm text-stone-500">Calculating — complete your first week to unlock this.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-3xl font-bold text-stone-900">{healthScore.score}</span>
                <span className="text-sm text-stone-400">/ 100</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center border-t border-stone-100 pt-3">
                <div>
                  <p className="text-sm font-bold text-stone-800">{healthScore.components!.consistency}<span className="text-stone-400 font-normal">/35</span></p>
                  <p className="text-[10px] text-stone-400 leading-tight mt-0.5">Consistency</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-800">{healthScore.components!.confidenceQuality}<span className="text-stone-400 font-normal">/25</span></p>
                  <p className="text-[10px] text-stone-400 leading-tight mt-0.5">Confidence</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-800">{healthScore.components!.balance}<span className="text-stone-400 font-normal">/25</span></p>
                  <p className="text-[10px] text-stone-400 leading-tight mt-0.5">Balance</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-800">{healthScore.components!.revisionDiscipline}<span className="text-stone-400 font-normal">/15</span></p>
                  <p className="text-[10px] text-stone-400 leading-tight mt-0.5">Revision</p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">Where you are</h2>
          <p className="text-sm font-bold text-stone-900">{phase.label} <span className="font-normal text-stone-400">· {phase.weekRange} · {weeksRemaining}w to CAT</span></p>
          <p className="text-xs text-stone-500 mt-1">{phase.objective}</p>
          <div className="mt-3 space-y-1 border-t border-stone-100 pt-3">
            <p className="text-xs text-stone-600"><span className="font-semibold text-stone-500">Daily:</span> {phase.dailyFocus}</p>
            <p className="text-xs text-stone-600"><span className="font-semibold text-stone-500">Weekly:</span> {phase.weeklyFocus}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">Built from your setup</h2>
          <dl className="space-y-2 text-sm">
            {weakestSection && (
              <div className="flex justify-between"><dt className="text-stone-500">Focus</dt><dd className="font-semibold text-stone-800">{weakestSection}{weakTopic ? ` — ${weakTopic}` : ''}</dd></div>
            )}
            {currentStage && (
              <div className="flex justify-between"><dt className="text-stone-500">Stage</dt><dd className="font-semibold text-stone-800">{STAGE_LABEL[currentStage] ?? currentStage}</dd></div>
            )}
            {biggestBlocker && (
              <div className="flex justify-between"><dt className="text-stone-500">Biggest blocker</dt><dd className="font-semibold text-stone-800">{BLOCKER_LABEL[biggestBlocker] ?? biggestBlocker}</dd></div>
            )}
            {targetPercentile && (
              <div className="flex justify-between"><dt className="text-stone-500">Target</dt><dd className="font-semibold text-stone-800">{targetPercentile}%ile</dd></div>
            )}
          </dl>
          <div className="mt-3 border-t border-stone-100 pt-3 flex items-center justify-between">
            <span className="text-xs text-stone-500">Blueprint confidence</span>
            <span className="text-sm font-bold text-stone-800">{blueprintConfidence.score}%</span>
          </div>
          {blueprintConfidence.reasons.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {blueprintConfidence.reasons.map((r) => (
                <li key={r} className="text-[11px] text-stone-400 leading-snug">{r}</li>
              ))}
            </ul>
          )}
        </div>

        {coverageTotal > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Coverage snapshot</h2>
              <Link href="/student/analysis" className="text-xs font-semibold text-orange-600 hover:text-orange-700">Edit →</Link>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {([
                ['Never started', coverageTally.not_started, 'text-stone-400'],
                ['Started', coverageTally.started, 'text-amber-600'],
                ['Completed', coverageTally.completed, 'text-teal-600'],
                ['Strong', coverageTally.strong, 'text-orange-600'],
              ] as const).map(([label, count, color]) => (
                <div key={label}>
                  <p className={`text-lg font-bold ${color}`}>{count}</p>
                  <p className="text-[10px] text-stone-400 leading-tight mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preparation Memory (Engine v2, Part 5) — what's actually happened,
            not just what's planned. Only renders once there's real history;
            a brand-new student sees no card rather than a padded-out zero
            state, matching the "never fabricate a fact" rule everywhere else
            on this page. */}
        {hasMemory && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">Preparation memory · last 30 days</h2>
            <div className="grid grid-cols-3 gap-2 text-center mb-4">
              <div>
                <p className="text-lg font-bold text-stone-900">{last30.daysStudied}</p>
                <p className="text-[10px] text-stone-400 leading-tight mt-0.5">Days studied</p>
              </div>
              <div>
                <p className="text-lg font-bold text-stone-900">{Math.round(last30.minutesStudied / 6) / 10}h</p>
                <p className="text-[10px] text-stone-400 leading-tight mt-0.5">Time studied</p>
              </div>
              <div>
                <p className="text-lg font-bold text-stone-900">{last30.topicsTouched}</p>
                <p className="text-[10px] text-stone-400 leading-tight mt-0.5">Topics touched</p>
              </div>
            </div>
            {(last30.confidenceCounts.green + last30.confidenceCounts.yellow + last30.confidenceCounts.red) > 0 && (
              <div className="flex items-center justify-center gap-4 text-sm border-t border-stone-100 pt-3 mb-3">
                <span>🟢 {last30.confidenceCounts.green}</span>
                <span>🟡 {last30.confidenceCounts.yellow}</span>
                <span>🔴 {last30.confidenceCounts.red}</span>
              </div>
            )}
            {mockTrend.latestPercentile != null && (
              <p className="text-xs text-stone-600 border-t border-stone-100 pt-3">
                Last mock: <span className="font-semibold text-stone-800">{mockTrend.latestPercentile}%ile</span>
                {mockTrend.previousPercentile != null && (
                  <> (was {mockTrend.previousPercentile}%ile — {mockTrend.latestPercentile > mockTrend.previousPercentile ? 'up' : mockTrend.latestPercentile < mockTrend.previousPercentile ? 'down' : 'unchanged'})</>
                )}
                {' · '}{mockTrend.count} logged this month
              </p>
            )}
          </div>
        )}

        {/* Weekly evolution (Engine v2, Part 6) — a plain-arithmetic diff
            against last week, not AI narration. Omitted entirely once there
            are fewer than two weeks of history to compare. */}
        {weeklyEvolution.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">This week vs last week</h2>
            <ul className="space-y-1.5">
              {weeklyEvolution.map((line) => (
                <li key={line} className="text-sm text-stone-700 flex gap-1.5">
                  <span aria-hidden className="text-orange-500">•</span><span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Blueprint Memory — "did I / when did I," over the student's full
            history (not just the last 30 days like the cards above). Pure
            read over Coverage Matrix + completions, no accuracy claims. */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">Study memory</h2>
          <input
            type="text"
            value={memorySearch}
            onChange={(e) => setMemorySearch(e.target.value)}
            placeholder="Search a topic — e.g. Geometry"
            className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {filteredMemory.map((entry) => (
              <li key={entry.topic} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-semibold text-stone-800">{entry.topic}</p>
                  <p className="text-xs text-stone-500">{memoryLine(entry)}</p>
                </div>
                <span className="shrink-0 text-[10px] font-semibold text-stone-400 uppercase tracking-wide mt-0.5">{STATUS_LABEL[entry.status] ?? entry.status}</span>
              </li>
            ))}
            {filteredMemory.length === 0 && (
              <li className="text-xs text-stone-400">No topic matches &quot;{memorySearch}&quot;.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
