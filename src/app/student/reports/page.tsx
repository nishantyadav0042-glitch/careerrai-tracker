'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { computeSummary } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DailyReport } from '@/types';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const CHIP_LABELS: Record<string, string> = {
  mock_scared: '😨 Mock scared me',
  burned_out: '🔥 Burned out',
  comparing: '👀 Comparing',
  family_pressure: '🏠 Family pressure',
  lost_confidence: '📉 Lost confidence',
  feeling_behind: '⏰ Feeling behind',
  all_good: '😌 All good',
};

export default function StudentReportsPage() {
  const supabase = createClient();
  const [period, setPeriod] = useState(7);
  // Fetch 30 days once, filter client-side — no refetch on period toggle
  const [allReports, setAllReports] = useState<DailyReport[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: reps } = await supabase
        .from('daily_reports')
        .select('report_date, study_duration, topics_covered, mock_taken, notes, mood_emoji, emotional_chips, total_accuracy')
        .eq('student_id', user.id)
        .order('report_date', { ascending: false })
        .limit(30);
      setAllReports((reps ?? []) as unknown as DailyReport[]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reports = allReports.slice(0, period);
  const summary = computeSummary(reports, period);

  if (loading) return <div className="py-20 text-center text-sm text-stone-500">Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">History</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
          Day by day
        </h1>
      </div>

      {/* Period selector — filters client-side, no refetch */}
      <div className="flex bg-stone-100 rounded-xl p-1">
        {[7, 10, 30].map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={cn('flex-1 py-2 text-sm font-medium rounded-lg transition-all', period === p ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600')}>
            {p} days
          </button>
        ))}
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Total study</div>
          <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{summary.totalStudy.toFixed(1)}<span className="text-sm text-stone-500 font-normal ml-1">hrs</span></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Mock tests</div>
          <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{summary.totalMocks}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Avg mock score</div>
          <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{summary.avgMockScore > 0 ? summary.avgMockScore.toFixed(0) : '—'}<span className="text-sm text-stone-500 font-normal ml-1">{summary.avgMockScore > 0 ? '%ile' : ''}</span></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Days submitted</div>
          <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{summary.daysSubmitted}<span className="text-sm text-stone-500 font-normal ml-1">/ {period}</span></div>
        </Card>
      </div>

      {/* Day-by-day */}
      <div className="space-y-2">
        {reports.map((r) => {
          const isOpen = expandedDay === r.report_date;
          const chips = (r as unknown as { emotional_chips?: string[] }).emotional_chips ?? [];
          return (
            <Card key={r.report_date} className="overflow-hidden">
              <button type="button" onClick={() => setExpandedDay(isOpen ? null : r.report_date)} className="w-full flex items-center justify-between p-4 hover:bg-stone-50 transition-colors">
                <div className="flex items-center gap-3 text-left">
                  <div className="text-center w-10 shrink-0">
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
                      {new Date(r.report_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}
                    </div>
                    <div className="text-lg font-bold text-stone-900 leading-none">
                      {new Date(r.report_date + 'T00:00:00').getDate()}
                    </div>
                  </div>
                  <div className="border-l border-stone-200 pl-3 min-w-0">
                    <div className="text-sm font-semibold text-stone-900 truncate">
                      {r.study_duration?.toFixed(1)} hrs · {(r.topics_covered ?? []).slice(0, 2).join(', ')}{(r.topics_covered?.length ?? 0) > 2 && ` +${(r.topics_covered?.length ?? 0) - 2}`}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      {r.mock_taken && <Badge color="orange">Mock</Badge>}
                      {r.mood_emoji && <span>{r.mood_emoji}</span>}
                      {chips.length > 0 && !chips.includes('all_good') && (
                        <span className="text-amber-600 font-medium">{chips.length} feeling{chips.length > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronDown className={cn('w-4 h-4 text-stone-400 transition-transform shrink-0', isOpen && 'rotate-180')} />
              </button>

              {isOpen && (
                <div className="border-t border-stone-200 p-4 bg-stone-50/50 space-y-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-1">What you studied</div>
                    <div className="flex flex-wrap gap-1">
                      {(r.topics_covered ?? []).map((t) => <Badge key={t} color="stone">{t}</Badge>)}
                    </div>
                  </div>

                  {chips.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-1">How you felt</div>
                      <div className="flex flex-wrap gap-1.5">
                        {chips.map((c: string) => (
                          <span key={c} className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            c === 'all_good' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          )}>
                            {CHIP_LABELS[c] ?? c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {r.notes && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-1">Notes</div>
                      <p className="text-xs text-stone-600 italic">&quot;{r.notes}&quot;</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
        {reports.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-sm text-stone-600">No logs yet — log today to start your streak.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
