'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { DayBar } from '@/lib/study-report';

// Hours per day. Recharts, matching /student/analysis so the app has one chart
// library rather than two.
//
// The colouring carries the meaning: a day the student LOGGED zero hours is
// drawn as a visible stub, a day they never logged is drawn as nothing. Those
// are different facts about a person — one showed up and told the truth, the
// other disappeared — and a chart that renders them identically hides the only
// one we can act on.
export function StudyHoursChart({ data }: { data: DayBar[] }) {
  const chart = data.map((d) => ({
    ...d,
    // Day-of-month only: 14 full dates will not fit on a phone.
    day: d.date.slice(8),
    // A logged zero gets a sliver so it is visibly present; an unlogged day
    // stays truly empty.
    plotted: d.logged && d.hours === 0 ? 0.08 : d.hours,
  }));

  const max = Math.max(1, ...data.map((d) => d.hours));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chart} margin={{ top: 5, right: 4, left: -28, bottom: 0 }}>
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: '#a8a29e' }}
          axisLine={false}
          tickLine={false}
          interval={1}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#a8a29e' }}
          axisLine={false}
          tickLine={false}
          domain={[0, Math.ceil(max)]}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: '#f5f5f4' }}
          contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }}
          formatter={(_v, _n, item) => {
            const d = item?.payload as DayBar | undefined;
            if (!d) return ['', ''];
            return [d.logged ? `${d.hours}h` : 'not logged', ''];
          }}
          labelFormatter={(l) => `Day ${l}`}
        />
        <Bar dataKey="plotted" radius={[3, 3, 0, 0]}>
          {chart.map((d) => (
            <Cell key={d.date} fill={d.logged ? (d.hours > 0 ? '#1c1917' : '#d6d3d1') : '#f5f5f4'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
