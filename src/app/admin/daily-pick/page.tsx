'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, HeartHandshake } from 'lucide-react';

// The founder dashboard for Daily Pick — one screen, checked daily, that
// decides whether the feature lives. Kill thresholds are printed on the
// screen itself so the decision rule survives founder mood: open rate under
// 25% after a week = nobody cares; fix discoverability or kill it.

interface Item {
  id: string; kind: string; topic: string | null; status: string; text: string;
  displayName: string | null; yes: number; no: number; totalVotes: number;
  helpfulPct: number | null; daysInPipeline: number; verdict: string;
}
interface Stats {
  funnel: { dau: number; opened: number; openRate: number | null; voted: number; voteRate: number | null; contributed: number; contributionRate: number | null; sharesBlocked: number };
  helpScore: number;
  items: Item[];
  topics: { topic: string; items: number; votes: number; helpfulPct: number | null }[];
  retention: { everVoters: number; votersActiveLast7d: number; note: string | null };
  bars: { minVotes: number; featurePct: number; archivePct: number };
}

const VERDICT_TONE: Record<string, string> = {
  feature: 'bg-emerald-100 text-emerald-700',
  archive: 'bg-stone-100 text-stone-500',
  drop: 'bg-rose-100 text-rose-600',
};

export default function DailyPickDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/daily-pick-stats');
    if (res.ok) setStats((await res.json()) as Stats);
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch */
  useEffect(() => { void load(); }, [load]);

  if (!stats) return <div className="p-6 text-sm text-stone-400">Loading…</div>;
  const f = stats.funnel;

  const tile = (label: string, value: string, warn?: boolean) => (
    <div className={`rounded-xl border p-3 ${warn ? 'border-rose-200 bg-rose-50' : 'border-stone-200 bg-white'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <p className={`mt-0.5 font-mono text-2xl font-bold ${warn ? 'text-rose-600' : 'text-stone-900'}`}>{value}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 p-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="rounded-lg p-2 hover:bg-stone-100"><ArrowLeft className="h-5 w-5 text-stone-600" /></Link>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-500"><HeartHandshake className="h-4 w-4 text-white" /></span>
          <div>
            <h1 className="text-lg font-bold text-stone-900">Daily Pick — live or die</h1>
            <p className="text-xs text-stone-500">Kill bars: open rate &lt;25% after week 1 · contribution &lt;1% = friction too high</p>
          </div>
        </div>

        {/* North star */}
        <div className="rounded-2xl bg-stone-900 p-4 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Community Help Score · last 24h</p>
          <p className="mt-1 font-mono text-4xl font-bold">{stats.helpScore}</p>
          <p className="mt-0.5 text-[11px] text-white/60">helpful votes + students who opened Daily Pick — moments one student&apos;s work reached another</p>
        </div>

        {/* Funnel */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tile('Active students 24h', String(f.dau))}
          {tile('Open rate', f.openRate != null ? `${f.openRate}%` : '—', f.openRate != null && f.openRate < 25)}
          {tile('Vote rate (of openers)', f.voteRate != null ? `${f.voteRate}%` : '—', f.voteRate != null && f.voteRate < 60)}
          {tile('Contribution rate', f.contributionRate != null ? `${f.contributionRate}%` : '—', f.contributionRate != null && f.contributionRate < 1)}
        </div>
        {f.sharesBlocked > 0 && (
          <p className="text-[11px] text-stone-500">{f.sharesBlocked} share attempt(s) blocked by the safety gate in the last 24h.</p>
        )}

        {/* Content quality */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-bold text-stone-900">Content quality</h2>
          <p className="mt-0.5 text-[11px] text-stone-500">
            Judged past {stats.bars.minVotes} votes: ≥{stats.bars.featurePct}% → feature · {stats.bars.archivePct}–{stats.bars.featurePct}% → archive · below → drop
          </p>
          <div className="mt-2 space-y-1">
            {stats.items.map((it) => (
              <div key={it.id} className="flex items-center gap-2 border-b border-stone-50 py-1.5 last:border-0">
                <span className="shrink-0 text-[13px]">{it.kind === 'tip' ? '💡' : '📷'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-stone-800">{it.text}</p>
                  <p className="text-[10px] text-stone-400">{it.topic ?? '—'} · as “{it.displayName}” · day {it.daysInPipeline}</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-stone-500">👍{it.yes} 👎{it.no}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${VERDICT_TONE[it.verdict] ?? 'bg-amber-50 text-amber-700'}`}>
                  {it.helpfulPct != null ? `${it.helpfulPct}% · ${it.verdict}` : it.verdict}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Topic intelligence */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-bold text-stone-900">Topic intelligence</h2>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {stats.topics.map((t) => (
              <p key={t.topic} className="flex justify-between text-[11px] text-stone-600">
                <span className="truncate">{t.topic}</span>
                <span className="shrink-0 font-mono text-stone-400">{t.items} · {t.helpfulPct != null ? `${t.helpfulPct}%` : `${t.votes}v`}</span>
              </p>
            ))}
          </div>
        </section>

        {/* Retention */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-bold text-stone-900">Voters — the retention cohort</h2>
          <p className="mt-1 text-[12px] text-stone-600">
            {stats.retention.everVoters} students have ever voted · {stats.retention.votersActiveLast7d} of them active in the last 7 days.
          </p>
          {stats.retention.note && <p className="mt-1 text-[11px] text-stone-400">{stats.retention.note}</p>}
        </section>
      </div>
    </div>
  );
}
