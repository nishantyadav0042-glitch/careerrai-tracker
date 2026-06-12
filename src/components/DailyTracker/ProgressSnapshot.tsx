'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ProgressSnapshotProps {
  studentId: string;
}

export function ProgressSnapshot({ studentId }: ProgressSnapshotProps) {
  const supabase = createClient();

  const { data, isLoading } = useQuery({
    queryKey: ['progress-snapshot', studentId],
    queryFn: async () => {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const weekStr = oneWeekAgo.toISOString().split('T')[0];

      const [{ data: weekReports }, { data: debriefs }] = await Promise.all([
        supabase
          .from('daily_reports')
          .select('study_duration, report_date')
          .eq('student_id', studentId)
          .gte('report_date', weekStr)
          .order('report_date', { ascending: false }),
        supabase
          .from('mock_debriefs')
          .select('overall_percentile, taken_on')
          .eq('student_id', studentId)
          .order('taken_on', { ascending: false })
          .limit(2),
      ]);

      const hoursThisWeek = (weekReports ?? []).reduce((sum, r) => sum + (r.study_duration || 0), 0);
      const daysLogged = (weekReports ?? []).length;

      const latestPercentile = debriefs?.[0]?.overall_percentile ?? null;
      const prevPercentile = debriefs?.[1]?.overall_percentile ?? null;
      const percentileArrow: 'up' | 'down' | 'same' | null =
        latestPercentile !== null && prevPercentile !== null
          ? latestPercentile > prevPercentile
            ? 'up'
            : latestPercentile < prevPercentile
            ? 'down'
            : 'same'
          : null;

      return { hoursThisWeek, daysLogged, latestPercentile, percentileArrow };
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-3 gap-2 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-stone-100 rounded-2xl h-20" />
        ))}
      </div>
    );
  }

  const { hoursThisWeek, daysLogged, latestPercentile, percentileArrow } = data;

  return (
    <Link href="/student/analysis" className="block">
      <div className="grid grid-cols-3 gap-2">
        <Tile
          value={`${hoursThisWeek.toFixed(0)}h`}
          label="This week"
          sub={`${daysLogged} days logged`}
        />
        <Tile
          value={latestPercentile !== null ? `${latestPercentile}%ile` : '—'}
          label="Last mock"
          arrow={percentileArrow}
        />
        <Tile value={`${daysLogged}/7`} label="Days logged" />
      </div>
      <p className="text-center text-xs text-stone-400 mt-2">Tap for full analysis →</p>
    </Link>
  );
}

function Tile({
  value,
  label,
  sub,
  arrow,
}: {
  value: string;
  label: string;
  sub?: string;
  arrow?: 'up' | 'down' | 'same' | null;
}) {
  return (
    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="text-lg font-bold text-stone-900 font-mono leading-none">{value}</span>
        {arrow === 'up' && <TrendingUp className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
        {arrow === 'down' && <TrendingDown className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
        {arrow === 'same' && <Minus className="w-3.5 h-3.5 text-stone-400 shrink-0" />}
      </div>
      <span className={cn('text-[10px] font-semibold uppercase tracking-wider text-stone-500')}>{label}</span>
      {sub && <span className="text-[10px] text-stone-400 leading-tight">{sub}</span>}
    </div>
  );
}
