import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendIcon } from '@/components/trend-icon';
import { CATTestWidget } from './cat-test-widget';
import { StudentHomeClient } from './home-client';
import { computeSummary, computeStreak, getHeatmapData } from '@/lib/analytics';
import { getTodayIST, formatDateLong } from '@/lib/utils';
import type { DailyReport } from '@/types';
import { ArrowRight, CheckCircle2, Clock, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

export default async function StudentHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  const today = getTodayIST();

  const { data: reports } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('student_id', user.id)
    .order('report_date', { ascending: false })
    .limit(30);

  const allReports = (reports ?? []) as DailyReport[];
  const last7 = allReports.slice(0, 7);
  const submittedToday = allReports.some((r) => r.report_date === today);
  const streak = computeStreak(allReports);
  const summary = computeSummary(last7, 7);
  const heatmap = getHeatmapData(allReports, 14);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Friend';

  return (
    <StudentHomeClient>
      <div className="space-y-5">
      {/* Greeting */}
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Hello,</p>
        <h1 className="text-3xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
          {firstName}
        </h1>
      </div>

      {/* CAT Readiness Test Widget */}
      <CATTestWidget userId={user.id} />

      {/* Today status */}
      <div className={cn('p-5 rounded-2xl border-2', submittedToday ? 'border-emerald-200 bg-emerald-50/40 bg-white' : 'border-orange-200 bg-orange-50/40 bg-white')}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {submittedToday ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <Clock className="w-4 h-4 text-orange-600" />
              )}
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-600">
                {submittedToday ? 'Done for today' : 'Pending'}
              </span>
            </div>
            <p className="text-base font-semibold text-stone-900">
              {submittedToday ? 'Report submitted ✓' : "Today's report not filled"}
            </p>
            <p className="text-xs text-stone-600 mt-0.5">{formatDateLong(today)}</p>
          </div>
          <Link
            href="/student/today"
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              submittedToday
                ? 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                : 'bg-orange-600 text-white hover:bg-orange-700'
            )}
          >
            {submittedToday ? 'Edit' : 'Fill now'} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Streak */}
      {streak > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-orange-600 to-orange-700 text-white">
          <div className="flex items-center gap-3">
            <Flame className="w-7 h-7" />
            <div>
              <div className="text-2xl font-bold leading-none">{streak} {streak === 1 ? 'day' : 'days'}</div>
              <div className="text-xs opacity-80 mt-0.5">Tracking streak — keep it alive</div>
            </div>
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Last 7 days</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Avg study/day</div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-stone-900 font-mono">{summary.avgStudy.toFixed(1)}</span>
              <span className="text-xs text-stone-500">hrs</span>
              <TrendIcon trend={summary.studyTrend} />
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Mock tests</div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-stone-900 font-mono">{summary.totalMocks}</span>
              <span className="text-xs text-stone-500">/ 7</span>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Confidence</div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-stone-900 font-mono">{summary.avgConfidence.toFixed(1)}</span>
              <span className="text-xs text-stone-500">/5</span>
              <TrendIcon trend={summary.confidenceTrend} />
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Stress</div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-stone-900 font-mono">{summary.avgStress.toFixed(1)}</span>
              <span className="text-xs text-stone-500">/5</span>
              <TrendIcon trend={summary.stressTrend} invert />
            </div>
          </Card>
        </div>
      </div>

      {/* Heatmap */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Last 14 days</h2>
          <Link href="/student/reports" className="text-[10px] text-stone-500 hover:text-stone-900">View all →</Link>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {heatmap.map((d, i) => {
            const intensity = d.hours === 0 ? 0 : Math.min(4, Math.floor(d.hours / 2));
            const colors = ['bg-stone-100', 'bg-orange-100', 'bg-orange-300', 'bg-orange-500', 'bg-orange-700'];
            return (
              <div
                key={i}
                className={cn('aspect-square rounded-md', colors[intensity])}
                title={`${d.date}: ${d.hours.toFixed(1)} hrs`}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-3 text-[10px] text-stone-500">
          <span>Less</span>
          <div className="flex gap-1">
            {['bg-stone-100', 'bg-orange-100', 'bg-orange-300', 'bg-orange-500', 'bg-orange-700'].map((c) => (
              <div key={c} className={cn('w-3 h-3 rounded-sm', c)} />
            ))}
          </div>
          <span>More</span>
        </div>
      </Card>

      <Link
        href="/student/reports"
        className="w-full flex items-center justify-center gap-2 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-900 hover:bg-stone-50 transition-colors"
      >
        View full report <ArrowRight className="w-4 h-4" />
      </Link>
      </div>
    </StudentHomeClient>
  );
}
