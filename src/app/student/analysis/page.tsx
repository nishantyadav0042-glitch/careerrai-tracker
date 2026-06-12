'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
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

interface MockDebrief {
  id: string;
  taken_on: string;
  overall_percentile: number | null;
  varc: { attempted?: number; correct?: number; time_min?: number; percentile?: number };
  dilr: { attempted?: number; correct?: number; time_min?: number; percentile?: number };
  qa: { attempted?: number; correct?: number; time_min?: number; percentile?: number };
  error_buckets: { conceptual: number; silly: number; time: number; panic: number; selection: number };
  strategy_note: string | null;
}

const BUCKET_LABELS = [
  { key: 'conceptual', emoji: '🧠', label: 'Conceptual' },
  { key: 'silly', emoji: '🤏', label: 'Silly' },
  { key: 'time', emoji: '⏱️', label: 'Time' },
  { key: 'panic', emoji: '😰', label: 'Panic' },
  { key: 'selection', emoji: '🎯', label: 'Selection' },
];

const BUCKET_COLORS: Record<string, string> = {
  conceptual: '#6366f1',
  silly: '#f59e0b',
  time: '#ef4444',
  panic: '#ec4899',
  selection: '#8b5cf6',
};

export default function AnalysisPage() {
  const supabase = createClient();
  const [debriefs, setDebriefs] = useState<MockDebrief[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: d } = await supabase
        .from('mock_debriefs')
        .select('*')
        .eq('student_id', user.id)
        .order('taken_on', { ascending: true })
        .limit(20);

      setDebriefs((d ?? []) as MockDebrief[]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Percentile trend data
  const percentileData = debriefs
    .filter((d) => d.overall_percentile !== null)
    .map((d) => ({
      date: new Date(d.taken_on + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      percentile: d.overall_percentile,
      varc: d.varc?.percentile ?? null,
      dilr: d.dilr?.percentile ?? null,
      qa: d.qa?.percentile ?? null,
    }));

  // Aggregated error buckets across all mocks
  const totalBuckets = debriefs.reduce(
    (acc, d) => {
      acc.conceptual += d.error_buckets?.conceptual ?? 0;
      acc.silly += d.error_buckets?.silly ?? 0;
      acc.time += d.error_buckets?.time ?? 0;
      acc.panic += d.error_buckets?.panic ?? 0;
      acc.selection += d.error_buckets?.selection ?? 0;
      return acc;
    },
    { conceptual: 0, silly: 0, time: 0, panic: 0, selection: 0 }
  );

  const bucketData = BUCKET_LABELS.map(({ key, emoji, label }) => ({
    name: `${emoji} ${label}`,
    key,
    value: totalBuckets[key as keyof typeof totalBuckets],
  })).sort((a, b) => b.value - a.value);

  // Section-wise accuracy from latest mock
  const latest = debriefs[debriefs.length - 1];
  const sectionAccuracy = latest
    ? [
        {
          section: 'VARC',
          accuracy: latest.varc?.attempted
            ? Math.round(((latest.varc.correct ?? 0) / latest.varc.attempted) * 100)
            : null,
          percentile: latest.varc?.percentile ?? null,
        },
        {
          section: 'DILR',
          accuracy: latest.dilr?.attempted
            ? Math.round(((latest.dilr.correct ?? 0) / latest.dilr.attempted) * 100)
            : null,
          percentile: latest.dilr?.percentile ?? null,
        },
        {
          section: 'QA',
          accuracy: latest.qa?.attempted
            ? Math.round(((latest.qa.correct ?? 0) / latest.qa.attempted) * 100)
            : null,
          percentile: latest.qa?.percentile ?? null,
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-stone-500">Loading analysis…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/student/tracker" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              Analysis
            </h1>
            <p className="text-sm text-stone-500">What the data says about you</p>
          </div>
        </div>

        {debriefs.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center">
            <p className="text-stone-600 font-medium">No data yet</p>
            <p className="text-sm text-stone-400 mt-1">Log a day and take a mock to see your analysis here.</p>
          </div>
        ) : (
          <>
            {/* Percentile trend */}
            {percentileData.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-200 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-4">
                  Percentile trend
                </h2>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={percentileData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#78716c' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#78716c' }} />
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
                </div>
              </div>
            )}

            {/* Latest mock section breakdown */}
            {sectionAccuracy.length > 0 && sectionAccuracy.some((s) => s.accuracy !== null) && (
              <div className="bg-white rounded-2xl border border-stone-200 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-4">
                  Last mock — section accuracy
                </h2>
                <div className="space-y-3">
                  {sectionAccuracy.map(({ section, accuracy, percentile }) => (
                    <div key={section} className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-stone-700 w-10">{section}</span>
                      <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-orange-500 rounded-full transition-all"
                          style={{ width: `${accuracy ?? 0}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono text-stone-700 w-12 text-right">
                        {accuracy !== null ? `${accuracy}%` : '—'}
                      </span>
                      {percentile !== null && (
                        <span className="text-xs text-stone-400 w-14 text-right">{percentile}%ile</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error bucket breakdown */}
            {bucketData.some((b) => b.value > 0) && (
              <div className="bg-white rounded-2xl border border-stone-200 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-4">
                  Where you lose marks (all mocks)
                </h2>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bucketData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#78716c' }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#44403c' }} width={110} />
                      <Tooltip contentStyle={{ background: '#1c1917', border: 'none', borderRadius: 8, color: 'white', fontSize: 12 }} />
                      <Bar dataKey="value" name="Errors" radius={[0, 4, 4, 0]}>
                        {bucketData.map((entry) => (
                          <Cell key={entry.key} fill={BUCKET_COLORS[entry.key] ?? '#94a3b8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Biggest issue callout */}
                {bucketData[0]?.value > 0 && (
                  <p className="text-xs text-stone-500 mt-3 text-center">
                    Your biggest leak: <strong className="text-stone-800">{bucketData[0].name}</strong> — {bucketData[0].value} errors
                  </p>
                )}
              </div>
            )}

            {/* Latest strategy note */}
            {latest?.strategy_note && (
              <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-teal-700 mb-2">
                  Last mock — what you&apos;ll do differently
                </p>
                <p className="text-sm text-teal-900 italic">&quot;{latest.strategy_note}&quot;</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
