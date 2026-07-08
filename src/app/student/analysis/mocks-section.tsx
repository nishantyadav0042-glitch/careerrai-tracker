'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { getLogDateString } from '@/lib/streak-utils';
import type { TestResult } from '@/types';
import { Brain, ArrowRight, Plus, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TestRunner } from '../test-runner';
import { MockDropIntervention } from '@/components/mock-drop-intervention';
import dynamic from 'next/dynamic';
import type { MockDebriefData } from '@/components/DailyTracker/MockDebriefModal';

const MockDebriefModal = dynamic(
  () => import('@/components/DailyTracker/MockDebriefModal').then((m) => m.MockDebriefModal),
  { ssr: false }
);

const READINESS_TEST = { id: 'cat-readiness', name: 'CAT Readiness Test', desc: '35 questions · ~15 min · One-time diagnostic', color: 'orange' as const };

interface MockDebriefRow {
  taken_on: string;
  overall_percentile: number | null;
  varc: { percentile?: number | null } | null;
  dilr: { percentile?: number | null } | null;
  qa: { percentile?: number | null } | null;
}

// Formerly its own page (/student/exams) — now the "Mocks" tab inside the
// merged Analysis panel (mocks + trends, one screen, per the founder's
// "lean and clean" nav pass). Same component, just without its own header
// and page-level padding, which the merged parent now owns.
export function MocksSection() {
  const supabase = createClient();
  const [results, setResults] = useState<TestResult[]>([]);
  const [mocks, setMocks] = useState<MockDebriefRow[]>([]);
  const [activeTest, setActiveTest] = useState<string | null>(null);
  const [debriefOpen, setDebriefOpen] = useState(false);
  const [submittingDebrief, setSubmittingDebrief] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [buddyId, setBuddyId] = useState<string | null>(null);
  const [dropAlert, setDropAlert] = useState<{ drop: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);
    const [{ data: profile }, { data: testData }, { data: mockData }] = await Promise.all([
      supabase.from('profiles').select('buddy_id').eq('id', user.id).single(),
      supabase.from('test_results').select('*').eq('student_id', user.id).order('attempt_date', { ascending: false }),
      supabase.from('mock_debriefs').select('taken_on, overall_percentile, varc, dilr, qa').eq('student_id', user.id).order('taken_on', { ascending: false }),
    ]);
    setBuddyId(profile?.buddy_id ?? null);
    setResults((testData ?? []) as TestResult[]);
    setMocks((mockData ?? []) as MockDebriefRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function handleDebriefSubmit(data: MockDebriefData) {
    setSubmittingDebrief(true);
    try {
      const res = await fetch('/api/logging/mock-debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, log_date: getLogDateString() }),
      });
      if (!res.ok) throw new Error('Failed to save mock');
      setDebriefOpen(false);
      await load();
    } finally {
      setSubmittingDebrief(false);
    }
  }

  async function saveResult(result: Omit<TestResult, 'id' | 'student_id' | 'created_at'>) {
    if (!userId) return;
    const { data } = await supabase.from('test_results').insert({ ...result, student_id: userId }).select().single();
    if (data) {
      const updated = [data as TestResult, ...results];
      setResults(updated);

      // Check for mock drop (need 2+ attempts)
      if (updated.length >= 2 && result.percentile !== undefined) {
        const prev = updated[1].percentile;
        const drop = prev - result.percentile;
        if (drop > 8) {
          // Check 30-day cooldown
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const { data: recent } = await supabase
            .from('mock_drop_alerts')
            .select('id')
            .eq('student_id', userId)
            .gte('triggered_at', thirtyDaysAgo.toISOString())
            .limit(1);
          if (!recent || recent.length === 0) {
            await supabase.from('mock_drop_alerts').insert({
              student_id: userId,
              drop_amount: drop,
              buddy_notified: !!buddyId,
            });
            setDropAlert({ drop });
            return; // don't close test runner — show intervention overlay first
          }
        }
      }
    }
    setActiveTest(null);
  }

  const latestMock = mocks[0];
  const prevMock = mocks[1];
  const trend = latestMock?.overall_percentile != null && prevMock?.overall_percentile != null
    ? latestMock.overall_percentile - prevMock.overall_percentile
    : null;

  return (
    <div className="space-y-5">
      {/* Real CAT mock history — the actual exam attempts, not the diagnostic */}
      <Card className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-stone-900">Mock history</h3>
            <p className="text-xs text-stone-500 mt-0.5">{loading ? 'Loading…' : `${mocks.length} mock${mocks.length === 1 ? '' : 's'} logged`}</p>
          </div>
          {latestMock?.overall_percentile != null && (
            <div className="text-right">
              <div className="text-2xl font-bold text-stone-900 font-mono">{Number(latestMock.overall_percentile)}<span className="text-sm text-stone-500 font-normal">%ile</span></div>
              {trend != null && trend !== 0 && (
                <div className={cn('flex items-center justify-end gap-1 text-xs font-semibold', trend > 0 ? 'text-teal-700' : 'text-red-600')}>
                  {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {trend > 0 ? '+' : ''}{trend.toFixed(0)} vs last
                </div>
              )}
              {trend === 0 && <div className="flex items-center justify-end gap-1 text-xs text-stone-400"><Minus className="w-3 h-3" />Flat</div>}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDebriefOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-orange-600 text-white hover:bg-orange-700 transition-all active:scale-[0.98] mb-3"
        >
          <Plus className="w-4 h-4" /> Log a mock
        </button>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-12 bg-stone-100 rounded-xl" />
            <div className="h-12 bg-stone-100 rounded-xl" />
          </div>
        ) : mocks.length === 0 ? (
          <div className="bg-stone-50 rounded-xl p-4 text-center">
            <p className="text-xs text-stone-600">No mocks logged yet — log your first IMS/TIME/2IIM/Cracku mock above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {mocks.map((m) => (
              <div key={m.taken_on} className="flex items-center justify-between gap-3 bg-stone-50 rounded-xl px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-stone-900">{formatDate(m.taken_on)}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {m.varc?.percentile != null && <Badge color="blue">VARC {m.varc.percentile}</Badge>}
                    {m.dilr?.percentile != null && <Badge color="orange">DILR {m.dilr.percentile}</Badge>}
                    {m.qa?.percentile != null && <Badge color="purple">QA {m.qa.percentile}</Badge>}
                  </div>
                </div>
                <div className="text-lg font-bold text-stone-900 font-mono shrink-0">
                  {m.overall_percentile != null ? `${Number(m.overall_percentile)}%ile` : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* One-time diagnostic — clearly separate from real mocks */}
      <div>
        <p className="text-xs uppercase tracking-widest text-stone-400 font-semibold px-1 mb-2">One-time diagnostic</p>
        {(() => {
          const test = READINESS_TEST;
          const history = results.filter((r) => r.test_type === test.id);
          const last = history[0];
          return (
            <Card className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-stone-900">{test.name}</h3>
                  <p className="text-xs text-stone-500 mt-0.5">{test.desc}</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-100">
                  <Brain className="w-5 h-5 text-orange-600" />
                </div>
              </div>

              {last ? (
                <div className="bg-stone-50 rounded-xl p-3 mb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Last attempt</div>
                      <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{last.score}<span className="text-sm text-stone-500 font-normal">/100</span></div>
                      <div className="text-xs text-stone-600 mt-0.5">Top {100 - last.percentile}% · {formatDate(last.attempt_date)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Attempts</div>
                      <div className="text-xl font-bold text-stone-900 font-mono mt-1">{history.length}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-stone-50 rounded-xl p-3 mb-3 text-center">
                  <p className="text-xs text-stone-600">Not attempted yet</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setActiveTest(test.id)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98] bg-orange-600 text-white hover:bg-orange-700"
              >
                {last ? 'Retake test' : 'Start test'} <ArrowRight className="w-4 h-4" />
              </button>
            </Card>
          );
        })()}
      </div>

      {activeTest && (
        <TestRunner
          testId={activeTest}
          testName={READINESS_TEST.name}
          onComplete={saveResult}
          onClose={() => setActiveTest(null)}
        />
      )}

      <MockDebriefModal
        isOpen={debriefOpen}
        onClose={() => setDebriefOpen(false)}
        onSubmit={handleDebriefSubmit}
        isSubmitting={submittingDebrief}
        logDate={getLogDateString()}
      />

      {dropAlert && userId && (
        <MockDropIntervention
          studentId={userId}
          dropAmount={dropAlert.drop}
          onDismiss={() => { setDropAlert(null); setActiveTest(null); }}
        />
      )}
    </div>
  );
}
