'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import dynamic from 'next/dynamic';

// Recharts is ~350 KB — lazy-load so it doesn't block the page shell.
const PercentileChart = dynamic(
  () => import('./charts').then((m) => m.PercentileChart),
  { ssr: false, loading: () => <div className="h-48 flex items-center justify-center text-xs text-stone-400">Loading chart…</div> }
);

interface MockDebrief {
  id: string;
  taken_on: string;
  mock_name: string | null;
  overall_percentile: number | null;
  varc: { percentile?: number | null };
  dilr: { percentile?: number | null };
  qa: { percentile?: number | null };
  strategy_note: string | null;
}

// The "Trends" tab — the one place a student watches their percentile climb
// across mocks. Trimmed (founder, 24 Jul): the Preparation Map was removed
// (topic status is managed on Home via swap + the plan pages — this was a
// third, redundant place doing the same thing), and the accuracy /
// error-bucket charts were removed because the debrief now captures
// percentiles only, so that data no longer exists (the old charts showed
// blanks/zeros). What's left is percentile-over-time — genuinely unique.
export function TrendsSection() {
  const { data: debriefs = [], isPending: loading } = useQuery({
    queryKey: ['analysis-trends-debriefs'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as MockDebrief[];

      const { data: d } = await supabase
        .from('mock_debriefs')
        .select('id, taken_on, mock_name, overall_percentile, varc, dilr, qa, strategy_note')
        .eq('student_id', user.id)
        .order('taken_on', { ascending: true })
        .limit(20);

      return (d ?? []) as MockDebrief[];
    },
  });

  // Percentile trend — overall + per-section, in the order they were taken.
  const percentileData = debriefs
    .filter((d) => d.overall_percentile !== null)
    .map((d) => ({
      date: new Date(d.taken_on + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      percentile: d.overall_percentile,
      varc: d.varc?.percentile ?? null,
      dilr: d.dilr?.percentile ?? null,
      qa: d.qa?.percentile ?? null,
    }));

  const latest = debriefs[debriefs.length - 1];

  if (loading) {
    return <div className="text-sm text-stone-500 py-8 text-center">Loading analysis…</div>;
  }

  return (
    <div className="space-y-6">
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
              'Overall percentile trend',
              'Section-wise percentile · VARC / DILR / QA',
              'Latest mock snapshot',
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

          {/* Latest observation */}
          {latest?.strategy_note && (
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-700 mb-2">
                Last mock — what you noticed
              </p>
              <p className="text-sm text-teal-900 italic">&quot;{latest.strategy_note}&quot;</p>
            </div>
          )}

          {/* Latest mock snapshot — percentiles only */}
          {latest && (
            <div className="bg-white rounded-2xl border border-stone-200 p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
                    Latest mock result
                  </p>
                  <p className="text-sm text-stone-700 mt-0.5">
                    {latest.mock_name ?? 'Mock'} ·{' '}
                    {new Date(latest.taken_on + 'T00:00:00').toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>
                {latest.overall_percentile !== null && (
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-3xl font-bold text-stone-900 leading-none">
                      {Math.round(latest.overall_percentile)}
                    </p>
                    <p className="text-[10px] text-stone-400 mt-0.5">overall %ile</p>
                  </div>
                )}
              </div>

              {/* Per-section percentile */}
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    { key: 'varc', label: 'VARC', color: 'teal' },
                    { key: 'dilr', label: 'DILR', color: 'orange' },
                    { key: 'qa',   label: 'QA',   color: 'indigo' },
                  ] as const
                ).map(({ key, label, color }) => {
                  const pct = latest[key]?.percentile ?? null;
                  const colorMap: Record<string, string> = {
                    teal: 'bg-teal-50 border-teal-200 text-teal-700',
                    orange: 'bg-orange-50 border-orange-200 text-orange-700',
                    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
                  };
                  return (
                    <div key={key} className={`rounded-xl border p-3 ${colorMap[color]}`}>
                      <p className="text-[11px] font-bold uppercase tracking-wider">{label}</p>
                      {pct !== null ? (
                        <p className="text-xl font-bold mt-1 leading-none">{Math.round(pct)}<span className="text-[10px] font-normal ml-0.5">%ile</span></p>
                      ) : (
                        <p className="text-xl font-bold mt-1 leading-none text-stone-300">—</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
