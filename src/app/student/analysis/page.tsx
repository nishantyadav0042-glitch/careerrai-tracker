'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Recharts is ~350 KB — lazy-load so it doesn't block the page shell.
const PercentileChart = dynamic(
  () => import('./charts').then((m) => m.PercentileChart),
  { ssr: false, loading: () => <div className="h-48 flex items-center justify-center text-xs text-stone-400">Loading chart…</div> }
);
const ErrorBucketChart = dynamic(
  () => import('./charts').then((m) => m.ErrorBucketChart),
  { ssr: false, loading: () => <div className="h-44 flex items-center justify-center text-xs text-stone-400">Loading chart…</div> }
);

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
  { key: 'conceptual', emoji: '🧠', label: 'Knowledge gap' },
  { key: 'silly', emoji: '⚠️', label: 'Execution error' },
  { key: 'time', emoji: '⏱️', label: 'Time misallocation' },
  { key: 'panic', emoji: '↩️', label: 'Misread / framing' },
  { key: 'selection', emoji: '✗', label: 'Selection error' },
];

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
          <>
            {/* Pre-mock promise, not a blank */}
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center space-y-2">
              <p className="text-3xl">📈</p>
              <p className="text-stone-800 font-semibold">Take 2 mocks and your trend line appears here.</p>
              <p className="text-sm text-stone-500">
                This is the chart that proves you&apos;re improving — raw scores lie, trends don&apos;t.
              </p>
            </div>
            <div className="space-y-2">
              {[
                'Section-wise percentile trend',
                'Error-bucket trend · are silly mistakes shrinking?',
                'Consistency heatmap',
              ].map((slot) => (
                <div
                  key={slot}
                  className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-3 text-center text-xs text-stone-400"
                >
                  {slot}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Percentile trend */}
            {percentileData.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-200 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-4">
                  Percentile trend
                </h2>
                <div className="h-48">
                  <PercentileChart data={percentileData} />
                </div>
                {(() => {
                  // One human sentence — never raw data alone
                  const first = percentileData[0]?.percentile;
                  const last = percentileData[percentileData.length - 1]?.percentile;
                  if (percentileData.length < 2 || first == null || last == null) return null;
                  const delta = Math.round(last - first);
                  const text =
                    delta > 0
                      ? `Overall moved ${first} → ${last} across ${percentileData.length} mocks — the trend is doing its job.`
                      : delta < 0
                      ? `Down ${Math.abs(delta)} points across ${percentileData.length} mocks — debrief the last one properly before the next.`
                      : `Flat across ${percentileData.length} mocks — consistency first, then push one section.`;
                  return <p className="text-xs text-stone-500 mt-3 text-center">{text}</p>;
                })()}
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
                  <ErrorBucketChart data={bucketData} />
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
