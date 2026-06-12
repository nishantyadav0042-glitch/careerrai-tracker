'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { computeSummary } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DailyReport } from '@/types';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function StudentReportsPage() {
  const supabase = createClient();
  const [period, setPeriod] = useState(7);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: reps } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('student_id', user.id)
        .order('report_date', { ascending: false })
        .limit(period);
      setReports((reps ?? []) as DailyReport[]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

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

      {/* Period selector */}
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
          <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{summary.avgMockScore > 0 ? summary.avgMockScore.toFixed(0) : '—'}<span className="text-sm text-stone-500 font-normal ml-1">{summary.avgMockScore > 0 ? '%' : ''}</span></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Days submitted</div>
          <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{summary.daysSubmitted}<span className="text-sm text-stone-500 font-normal ml-1">/ {period}</span></div>
        </Card>
      </div>

      {/* Day-by-day */}
      <div>
        <div className="space-y-2">
          {reports.map((r) => {
            const isOpen = expandedDay === r.report_date;
            return (
              <Card key={r.report_date} className="overflow-hidden">
                <button type="button" onClick={() => setExpandedDay(isOpen ? null : r.report_date)} className="w-full flex items-center justify-between p-4 hover:bg-stone-50 transition-colors">
                  <div className="flex items-center gap-3 text-left">
                    <div className="text-center">
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
                        {new Date(r.report_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}
                      </div>
                      <div className="text-lg font-bold text-stone-900 leading-none">
                        {new Date(r.report_date + 'T00:00:00').getDate()}
                      </div>
                    </div>
                    <div className="border-l border-stone-200 pl-3">
                      <div className="text-sm font-semibold text-stone-900">
                        {r.study_duration.toFixed(1)} hrs · {(r.topics_covered ?? []).slice(0, 2).join(', ')}{(r.topics_covered?.length ?? 0) > 2 && ` +${(r.topics_covered?.length ?? 0) - 2}`}
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-2">
                        {r.mock_taken && <Badge color="orange">Mock {r.total_accuracy}%</Badge>}
                        <span>Mood {r.confidence}/5</span>
                      </div>
                    </div>
                  </div>
                  <ChevronDown className={cn('w-4 h-4 text-stone-400 transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="border-t border-stone-200 p-4 bg-stone-50/50 space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-1">Study</div>
                      <div className="text-sm text-stone-800">{r.study_duration.toFixed(1)} hrs · Quality {r.quality_focus}/5 · Difficulty {r.difficulty}/5</div>
                      <div className="flex flex-wrap gap-1 mt-1">{(r.topics_covered ?? []).map((t) => <Badge key={t} color="stone">{t}</Badge>)}</div>
                    </div>
                    {r.mock_taken && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-1">Performance</div>
                        <div className="text-sm text-stone-800">{r.mock_name} · Q{r.quant_score} V{r.verbal_score} L{r.logic_score} · Acc {r.total_accuracy}%</div>
                      </div>
                    )}
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-1">Mood</div>
                      <div className="text-sm text-stone-800">Conf {r.confidence} · Stress {r.stress} · Sleep {r.sleep_quality} · Energy {r.overall_energy}</div>
                      {r.notes && <div className="text-xs text-stone-600 mt-1 italic">&quot;{r.notes}&quot;</div>}
                    </div>
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
    </div>
  );
}
