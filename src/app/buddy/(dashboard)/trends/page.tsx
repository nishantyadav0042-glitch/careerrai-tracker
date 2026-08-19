import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import { computeSummary } from '@/lib/analytics';
import type { Profile, DailyReport } from '@/types';
import BuddyTrendsCharts from './trends-charts-lazy';

const LINE_COLORS = ['#1c1917', '#ea580c', '#0f766e', '#7c3aed', '#be123c'];

export default async function BuddyTrendsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('buddy_id', user.id)
    .eq('role', 'student');

  const studentList = (students ?? []) as Pick<Profile, 'id' | 'full_name'>[];

  const allDates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    allDates.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  }

  const summaries: Array<{ id: string; name: string; avgStudy: number | null; avgConfidence: number; daysSubmitted: number; reports: DailyReport[] }> = [];

  if (studentList.length > 0) {
    const weekAgo = allDates[0];
    const { data: allReports } = await supabase
      .from('daily_reports')
      .select('*')
      .in('student_id', studentList.map((s) => s.id))
      .gte('report_date', weekAgo);

    for (const s of studentList) {
      const reps = (allReports ?? []).filter((r: DailyReport) => r.student_id === s.id) as DailyReport[];
      // Q3 -- a FIFTH re-implementation of the mean stood here, dividing known
      // hours by EVERY logged day including the ones we never measured. One
      // average, one place: computeSummary already drops unmeasured days and
      // returns null rather than a fabricated 0.
      const avgStudy = computeSummary(reps, 7).avgStudy;
      const avgConfidence = reps.length ? reps.reduce((sum, r) => sum + r.confidence, 0) / reps.length : 0;
      summaries.push({ id: s.id, name: s.full_name, avgStudy, avgConfidence, daysSubmitted: reps.length, reports: reps });
    }
  }

  // Build chart data
  const chartData = allDates.map((date) => {
    const point: Record<string, string | number | null> = { date: formatDate(date) };
    for (const s of summaries) {
      const r = s.reports.find((rep) => rep.report_date === date);
      point[s.name.split(' ')[0]] = r ? r.study_duration : null;
    }
    return point;
  });

  return (
    <div className="space-y-5 pb-24">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">All students</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>Performance trends</h1>
      </div>

      {/* Note: recharts requires client component; pass data as JSON */}
      <BuddyTrendsCharts chartData={chartData} summaries={summaries} colors={LINE_COLORS} />
    </div>
  );
}

