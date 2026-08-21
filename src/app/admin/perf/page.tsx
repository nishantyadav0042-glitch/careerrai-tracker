import { requireAdmin } from '@/lib/admin-auth';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Speed · CareerRai' };

// Step 13: the founder speedometer. Every number here was measured on a
// real student's device on their real network (perf-beacon.tsx) — not
// estimated, not simulated. p50 = typical student, p90 = the slow-phone /
// bad-network student who churns first.

const METRIC_LABEL: Record<string, string> = {
  lcp: 'Page visible (LCP)',
  nav: 'Tap → new page',
  ttfb: 'Server first byte',
  fcp: 'First paint',
  interactive: 'Interactive',
};

function pct(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function fmt(ms: number | null): string {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function speedColor(ms: number | null, slow: number, bad: number): string {
  if (ms == null) return 'text-stone-400';
  if (ms >= bad) return 'text-rose-600';
  if (ms >= slow) return 'text-orange-600';
  return 'text-teal-700';
}

export default async function PerfPage() {
  // Local JWT verification — middleware already paid the network auth hop.
  const { admin } = await requireAdmin();

  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const weekAgoIso = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: events } = await admin
    .from('perf_events')
    .select('path, metric, value_ms, device, connection, created_at')
    .gte('created_at', weekAgoIso)
    .order('created_at', { ascending: false })
    .limit(5000);

  const rows = events ?? [];

  // Per-path aggregates for the two student-felt metrics.
  const byPath = new Map<string, { lcp: number[]; nav: number[] }>();
  for (const e of rows) {
    if (e.metric !== 'lcp' && e.metric !== 'nav') continue;
    if (!byPath.has(e.path)) byPath.set(e.path, { lcp: [], nav: [] });
    byPath.get(e.path)![e.metric as 'lcp' | 'nav'].push(e.value_ms);
  }
  const pathRows = [...byPath.entries()]
    .map(([path, m]) => {
      const lcp = m.lcp.sort((a, b) => a - b);
      const nav = m.nav.sort((a, b) => a - b);
      return { path, samples: lcp.length + nav.length, lcp50: pct(lcp, 50), lcp90: pct(lcp, 90), nav50: pct(nav, 50), nav90: pct(nav, 90) };
    })
    .sort((a, b) => (b.lcp90 ?? b.nav90 ?? 0) - (a.lcp90 ?? a.nav90 ?? 0));

  // Device/connection split for LCP — the Samsung-A15-vs-OnePlus answer.
  const byClass = new Map<string, number[]>();
  for (const e of rows) {
    if (e.metric !== 'lcp') continue;
    const key = `${e.device ?? '?'} · ${e.connection ?? '?'}`;
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key)!.push(e.value_ms);
  }
  const classRows = [...byClass.entries()]
    .map(([key, vals]) => {
      const sorted = vals.sort((a, b) => a - b);
      return { key, count: vals.length, p50: pct(sorted, 50), p90: pct(sorted, 90) };
    })
    .sort((a, b) => (b.p90 ?? 0) - (a.p90 ?? 0));

  const metricCounts = new Map<string, number>();
  for (const e of rows) metricCounts.set(e.metric, (metricCounts.get(e.metric) ?? 0) + 1);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Speed</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Last 7 days, measured on real student devices. p90 is the slow-phone student — the one who churns first.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
            No measurements yet — data starts flowing as soon as students open the app on this deploy.
          </div>
        ) : (
          <>
            {/* Route-by-route — the founder table */}
            <div className="rounded-2xl border border-stone-200 bg-white p-4 mb-4">
              <h2 className="text-sm font-bold text-stone-900 mb-3">Route by route</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr className="text-left text-stone-400">
                      <th className="py-1.5 pr-2 font-semibold">Page</th>
                      <th className="py-1.5 pr-2 font-semibold text-right">Visible p50</th>
                      <th className="py-1.5 pr-2 font-semibold text-right">Visible p90</th>
                      <th className="py-1.5 pr-2 font-semibold text-right">Tap→page p50</th>
                      <th className="py-1.5 font-semibold text-right">Tap→page p90</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pathRows.map((r) => (
                      <tr key={r.path} className="border-t border-stone-100">
                        <td className="py-1.5 pr-2 font-semibold text-stone-700 truncate max-w-[10rem]">{r.path}</td>
                        <td className={cn('py-1.5 pr-2 text-right font-bold', speedColor(r.lcp50, 1500, 3000))}>{fmt(r.lcp50)}</td>
                        <td className={cn('py-1.5 pr-2 text-right font-bold', speedColor(r.lcp90, 2500, 4000))}>{fmt(r.lcp90)}</td>
                        <td className={cn('py-1.5 pr-2 text-right font-bold', speedColor(r.nav50, 300, 1000))}>{fmt(r.nav50)}</td>
                        <td className={cn('py-1.5 text-right font-bold', speedColor(r.nav90, 500, 1500))}>{fmt(r.nav90)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Device × network split */}
            <div className="rounded-2xl border border-stone-200 bg-white p-4 mb-4">
              <h2 className="text-sm font-bold text-stone-900 mb-3">By device & network (page visible)</h2>
              <div className="space-y-1.5">
                {classRows.map((r) => (
                  <div key={r.key} className="flex items-center justify-between text-xs">
                    <span className="text-stone-600 font-semibold">{r.key} <span className="font-normal text-stone-400">· {r.count}</span></span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <span className={cn('font-bold', speedColor(r.p50, 1500, 3000))}>{fmt(r.p50)}</span>
                      <span className="text-stone-300"> / </span>
                      <span className={cn('font-bold', speedColor(r.p90, 2500, 4000))}>{fmt(r.p90)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample counts */}
            <p className="text-[11px] text-stone-400">
              {rows.length} measurements · {[...metricCounts.entries()].map(([m, c]) => `${METRIC_LABEL[m] ?? m}: ${c}`).join(' · ')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
