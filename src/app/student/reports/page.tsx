'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { computeSummary } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import type { DailyReport, BuddyFeedback } from '@/types';
import { ChevronDown, Award, Star, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const TOPIC_COLORS = ['#1c1917', '#ea580c', '#0f766e', '#a16207', '#9f1239', '#4338ca'];

export default function StudentReportsPage() {
  const supabase = createClient();
  const [period, setPeriod] = useState(7);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [feedback, setFeedback] = useState<BuddyFeedback[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: reps }, { data: fb }] = await Promise.all([
        supabase.from('daily_reports').select('*').eq('student_id', user.id).order('report_date', { ascending: false }).limit(period),
        supabase.from('buddy_feedback').select('*').eq('student_id', user.id).order('feedback_date', { ascending: false }),
      ]);
      setReports((reps ?? []) as DailyReport[]);
      setFeedback((fb ?? []) as BuddyFeedback[]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const summary = computeSummary(reports, period);

  const topicCounts: Record<string, number> = {};
  reports.forEach((r) => r.topics_covered?.forEach((t) => { topicCounts[t] = (topicCounts[t] ?? 0) + 1; }));
  const topicData = Object.entries(topicCounts).map(([name, value]) => ({ name, value }));

  const perfData = reports.slice().reverse().map((r) => ({ date: formatDate(r.report_date), score: r.mock_taken ? r.total_accuracy : null }));

  if (loading) return <div className="py-20 text-center text-sm text-stone-500">Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Consolidated Report</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
          Your progress
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

      {/* Topic donut */}
      {topicData.length > 0 && (
        <Card className="p-5">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Topic distribution</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={topicData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                  {topicData.map((_, idx) => <Cell key={idx} fill={TOPIC_COLORS[idx % TOPIC_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1c1917', border: 'none', borderRadius: 8, color: 'white', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {topicData.map((t, i) => (
              <div key={t.name} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: TOPIC_COLORS[i % TOPIC_COLORS.length] }} />
                <span className="text-xs text-stone-700">{t.name}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Mock performance chart */}
      {summary.totalMocks > 0 && (
        <Card className="p-5">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Mock test performance</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={perfData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#78716c' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#78716c' }} />
                <Tooltip contentStyle={{ background: '#1c1917', border: 'none', borderRadius: 8, color: 'white', fontSize: 12 }} />
                <Line type="monotone" dataKey="score" stroke="#ea580c" strokeWidth={2.5} dot={{ fill: '#ea580c', r: 4 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Day-by-day */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Day by day</h2>
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
              <p className="text-sm text-stone-600">No reports yet — fill today&apos;s to start your streak.</p>
            </Card>
          )}
        </div>
      </div>

      {/* Buddy feedback */}
      {feedback.length > 0 && (
        <Card className="p-5 bg-teal-50 border-teal-200">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-4 h-4 text-teal-700" />
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-800">Buddy feedback</span>
          </div>
          {feedback.map((f) => (
            <div key={f.id} className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-600">{new Date(f.feedback_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                <div className="flex">{[1,2,3,4,5].map((s) => <Star key={s} className={cn('w-3.5 h-3.5', s <= f.rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300')} />)}</div>
              </div>
              <p className="text-sm text-stone-800 leading-relaxed">&quot;{f.feedback_text}&quot;</p>
              {f.next_steps?.length > 0 && (
                <div className="pt-2 border-t border-teal-200">
                  <div className="text-[10px] uppercase tracking-wider text-teal-700 font-semibold mb-1.5">Next steps</div>
                  <ul className="space-y-1">
                    {f.next_steps.map((s, j) => (
                      <li key={j} className="text-xs text-stone-700 flex items-start gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-teal-600 mt-0.5 flex-shrink-0" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
