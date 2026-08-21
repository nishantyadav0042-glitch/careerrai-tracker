import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeHealthScalars, computeAgeCohorts, evaluateAlerts, confidenceFor, METRIC_OWNER, type HealthScalars, type Confidence } from '@/lib/mission-control';
import { getRosterMomentum, momentumDistribution, bandMeta } from '@/lib/momentum';
import { AutoRefresh } from '@/components/auto-refresh';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mission Control · CareerRai' };

function ConfBadge({ c }: { c: Confidence }) {
  const map: Record<Confidence, string> = {
    exact: 'bg-stone-100 text-stone-500',
    high: 'bg-emerald-50 text-emerald-700',
    medium: 'bg-amber-50 text-amber-700',
    low: 'bg-rose-50 text-rose-700',
  };
  return <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide', map[c])}>{c}</span>;
}

function Delta({ now, prev, goodIsUp = true }: { now: number; prev: number | null; goodIsUp?: boolean }) {
  if (prev == null) return <span className="text-[11px] text-stone-300">·</span>;
  const d = Math.round((now - prev) * 10) / 10;
  if (d === 0) return <span className="text-[11px] text-stone-400">▬ 0</span>;
  const up = d > 0;
  const good = up === goodIsUp;
  return (
    <span className={cn('text-[11px] font-bold tabular-nums', good ? 'text-emerald-600' : 'text-rose-600')}>
      {up ? '▲' : '▼'} {up ? '+' : ''}{d}
    </span>
  );
}

export default async function MissionControlPage() {
  const { admin } = await requireAdmin();

  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const yesterdayIso = new Date(Date.now() - 20 * 3600_000).toISOString();
  const [now, cohorts, roster, prevRows, snap24Rows] = await Promise.all([
    computeHealthScalars(admin),
    computeAgeCohorts(admin),
    getRosterMomentum(admin),
    admin.from('metric_snapshots').select('metrics, captured_at').order('captured_at', { ascending: false }).limit(1),
    // Nearest snapshot ~24h old for the "vs yesterday" delta.
    admin.from('metric_snapshots').select('metrics, captured_at')
      .lte('captured_at', yesterdayIso)
      .order('captured_at', { ascending: false }).limit(1),
  ]);
  const prev = (snap24Rows.data?.[0]?.metrics as HealthScalars | undefined) ?? null;
  const alerts = evaluateAlerts(now, (prevRows.data?.[0]?.metrics as HealthScalars | undefined) ?? null);

  const deliveryPct = now.pushedToday ? Math.round((now.receivedToday / now.pushedToday) * 100) : null;
  const studyConf = confidenceFor(now.pushedToday);

  // The headline. "How many students could we reliably reach in the next 5
  // minutes if we absolutely had to." One number for the whole ecosystem.
  const score = now.reachabilityPct;

  const dist = momentumDistribution(roster);
  const bandColor: Record<string, string> = {
    emerald: 'bg-emerald-500', teal: 'bg-teal-500', amber: 'bg-amber-400', orange: 'bg-orange-500', rose: 'bg-rose-500',
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <AutoRefresh seconds={60} />
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
        <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>

        {/* Alerts first — they exist to interrupt. */}
        {alerts.length > 0 && (
          <div className="mb-4 space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className={cn('rounded-xl border px-4 py-3 text-sm font-semibold',
                a.level === 'critical' ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-amber-300 bg-amber-50 text-amber-800')}>
                {a.level === 'critical' ? '🔴' : '🟠'} {a.message}
              </div>
            ))}
          </div>
        )}

        {/* Headline: Reachability Score */}
        <div className="rounded-2xl border border-stone-900 bg-stone-900 p-5 text-white">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Reachability Score</p>
            <span className="text-[10px] font-mono text-stone-500">live · refreshes every 60s</span>
          </div>
          <div className="mt-1 flex items-end gap-3">
            <span className="text-5xl font-extrabold tabular-nums">{score}%</span>
            <div className="mb-1.5 flex items-center gap-2">
              <Delta now={score} prev={prev?.reachabilityPct ?? null} />
              <span className="text-xs text-stone-400">vs yesterday</span>
            </div>
          </div>
          <p className="mt-1 text-sm text-stone-300">
            <b className="text-white">{now.reachable}</b> of {now.total} students could be reached by push in the next 5 minutes.
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">Owner: {METRIC_OWNER.reachability}</p>
        </div>

        {/* Headline metric tiles */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Tile label="Permission granted" value={now.permissionGranted} delta={<Delta now={now.permissionGranted} prev={prev?.permissionGranted ?? null} />} owner={METRIC_OWNER.permission} conf="exact" />
          <Tile label="Reachable now" value={now.reachable} delta={<Delta now={now.reachable} prev={prev?.reachable ?? null} />} owner={METRIC_OWNER.reachable} conf="exact" />
          <Tile label="Dead (recovering)" value={now.dead} delta={<Delta now={now.dead} prev={prev?.dead ?? null} goodIsUp={false} />} owner={METRIC_OWNER.dead} conf="exact" />
          <Tile label="Same-day deaths · 7d" value={now.sameDayDeaths7d} delta={<Delta now={now.sameDayDeaths7d} prev={prev?.sameDayDeaths7d ?? null} goodIsUp={false} />} owner={METRIC_OWNER.sameDayDeaths} conf="exact" tone={now.sameDayDeaths7d > 0 ? 'bad' : 'good'} />
          <Tile label="Delivery today" value={deliveryPct == null ? '—' : `${deliveryPct}%`} sub={`${now.receivedToday}/${now.pushedToday} received`} owner={METRIC_OWNER.delivery} conf={studyConf} />
          <Tile label="Clicks today" value={now.clickedToday} sub={now.pushedToday ? `of ${now.pushedToday} pushed` : ''} owner={METRIC_OWNER.delivery} conf={studyConf} />
        </div>

        {/* Student Momentum — the central variable. The whole roster, banded.
            Each band links to the list of exactly those students. */}
        <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Student momentum · {roster.length} students</p>
            <Link href="/admin/momentum" className="text-[11px] font-semibold text-teal-700 hover:text-teal-800">open the list →</Link>
          </div>
          <p className="mb-3 text-[11px] text-stone-500">One score per student (study recency + consistency + notification engagement + intent). This is who is winning and who needs rescuing — tap a band.</p>
          <div className="mb-2 flex h-3 overflow-hidden rounded-full">
            {dist.map((d) => {
              const m = bandMeta(d.band);
              const pct = roster.length ? (d.count / roster.length) * 100 : 0;
              return <div key={d.band} className={bandColor[m.color]} style={{ width: `${pct}%` }} title={`${m.label}: ${d.count}`} />;
            })}
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {dist.map((d) => {
              const m = bandMeta(d.band);
              return (
                <Link key={d.band} href={`/admin/momentum?band=${d.band}`} className="rounded-lg border border-stone-100 bg-stone-50 p-2 hover:border-stone-300">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('h-2 w-2 rounded-full', bandColor[m.color])} />
                    <span className="text-lg font-bold text-stone-900 tabular-nums">{d.count}</span>
                  </div>
                  <div className="text-[10px] font-semibold text-stone-500">{m.label}</div>
                </Link>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-stone-400">Owner: shared — Learning OS drives it up, Notification OS keeps it reachable, Sales acts on the top bands.</p>
        </div>

        {/* Learning Intelligence health — the LIS running live across the roster. */}
        <Link href="/admin/lis-health" className="mt-5 flex items-center gap-3 rounded-2xl border border-stone-900 bg-stone-900 p-4 text-white hover:bg-stone-800">
          <span className="text-2xl">🧠</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Learning Intelligence — health</p>
            <p className="text-[12px] text-stone-300">Velocity distribution, today&apos;s decision per student, adaptation drift, leading bottlenecks — the engine, live.</p>
          </div>
          <span className="shrink-0 text-[11px] font-semibold text-stone-300">open →</span>
        </Link>

        {/* Leading indicators — subscription-age cohorts. Watch the young ones. */}
        <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Leading indicator · subscription survival by age</p>
            <span className="text-[10px] text-stone-400">watch the young cohorts</span>
          </div>
          <p className="mb-3 text-[11px] text-stone-500">If a young cohort starts dying, you know days before 28-day retention collapses. This is the early-warning line.</p>
          <div className="space-y-1.5">
            {cohorts.map((c) => (
              <div key={c.label} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs font-semibold text-stone-700">{c.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.pct ?? 0}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right font-mono text-[11px] text-stone-500 tabular-nums">
                  {c.pct == null ? '—' : `${c.pct}%`} <span className="text-stone-400">({c.alive}/{c.total})</span>
                </span>
                <ConfBadge c={c.confidence} />
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-stone-400">
          Live production state · confidence reflects sample size (167 students → one failure can move a rate several points).
        </p>
      </div>
    </div>
  );
}

function Tile({ label, value, delta, sub, owner, conf, tone }: {
  label: string; value: number | string; delta?: React.ReactNode; sub?: string; owner: string; conf: Confidence; tone?: 'good' | 'bad';
}) {
  return (
    <div className={cn('rounded-xl border bg-white p-3', tone === 'bad' ? 'border-rose-200' : tone === 'good' ? 'border-emerald-200' : 'border-stone-200')}>
      <div className="flex items-start justify-between gap-1">
        <span className="text-2xl font-extrabold text-stone-900 tabular-nums">{value}</span>
        {delta}
      </div>
      <div className="mt-0.5 text-[11px] font-semibold text-stone-600">{label}</div>
      {sub && <div className="text-[10px] text-stone-400">{sub}</div>}
      <div className="mt-1.5 flex items-center justify-between gap-1">
        <span className="text-[9px] text-stone-400">{owner}</span>
        <ConfBadge c={conf} />
      </div>
    </div>
  );
}
