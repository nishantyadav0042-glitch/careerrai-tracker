'use client';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const BUCKET_COLORS: Record<string, string> = {
  conceptual: '#6366f1',
  silly: '#f59e0b',
  time: '#ef4444',
  panic: '#ec4899',
  selection: '#8b5cf6',
};

interface PercentilePoint {
  date: string;
  percentile: number | null;
  varc: number | null;
  dilr: number | null;
  qa: number | null;
}

interface BucketBar {
  name: string;
  key: string;
  value: number;
}

export function PercentileChart({ data }: { data: PercentilePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#78716c' }} />
        <YAxis domain={[(dataMin: number) => Math.max(55, Math.floor((dataMin - 5) / 5) * 5), 100]} tick={{ fontSize: 10, fill: '#78716c' }} />
        <Tooltip
          contentStyle={{ background: '#1c1917', border: 'none', borderRadius: 8, color: 'white', fontSize: 12 }}
          formatter={(value, name) => [`${value}%ile`, name]}
        />
        <Line type="monotone" dataKey="percentile" name="Overall" stroke="#ea580c" strokeWidth={2.5} dot={{ fill: '#ea580c', r: 4 }} connectNulls />
        <Line type="monotone" dataKey="varc" name="VARC" stroke="#0f766e" strokeWidth={1.5} dot={{ r: 2 }} connectNulls strokeDasharray="4 2" />
        <Line type="monotone" dataKey="dilr" name="DILR" stroke="#4338ca" strokeWidth={1.5} dot={{ r: 2 }} connectNulls strokeDasharray="4 2" />
        <Line type="monotone" dataKey="qa" name="QA" stroke="#b45309" strokeWidth={1.5} dot={{ r: 2 }} connectNulls strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ErrorBucketChart({ data }: { data: BucketBar[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#78716c' }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#44403c' }} width={110} />
        <Tooltip contentStyle={{ background: '#1c1917', border: 'none', borderRadius: 8, color: 'white', fontSize: 12 }} />
        <Bar dataKey="value" name="Errors" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={entry.key} fill={BUCKET_COLORS[entry.key] ?? '#94a3b8'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
