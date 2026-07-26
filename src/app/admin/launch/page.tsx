'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Rocket, RefreshCw } from 'lucide-react';

// THE launch dashboard — one page, opened every morning for the first 30 days.
// Nothing here is a vanity metric: every number either tells you the app is
// working (crash-free, OTP, logs) or tells you a feature deserves to live
// (Daily Pick opens, votes, shares). Anything too thin to state honestly shows
// a dash instead of a number.

interface Metrics {
  reach: { dau: number; weeklyActive: number; newStudents24: number };
  reliability: {
    crashFreePct: number | null; studentsWithErrors: number; errorReports24: number;
    topCrashes: { fingerprint: string; count: number; message: string; path: string | null }[];
  };
  otp: { sends24: number; distinctPhones24: number; newAccounts24: number; loggedIn24: number };
  installSource: Record<string, number>;
  study: { logged24: number; logRate: number | null };
  peerLearning: {
    dailyPickOpens: number; openRate: number | null; voters: number; voteRate: number | null;
    sharedTips24: number; sharedQuestions24: number;
    shelfQuestions: number; shelfTips: number; shelfMinQuestions: number; shelfMinTips: number;
  };
  push: { sent24: number; opened24: number; openRate: number | null };
}

const SOURCE_LABEL: Record<string, string> = {
  play: '▶ Play Store', pwa: '⬇ Web install', ios: '🍎 iPhone', browser: '🌐 Browser', unknown: '· Unknown',
};

export default function LaunchDashboard() {
  const [m, setM] = useState<Metrics | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const res = await fetch('/api/admin/launch-metrics');
    if (res.ok) setM((await res.json()) as Metrics);
    setBusy(false);
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch */
  useEffect(() => { void load(); }, [load]);

  if (!m) return <div className="p-6 text-sm text-stone-400">Loading…</div>;

  const tile = (label: string, value: string, sub?: string, warn?: boolean) => (
    <div className={`rounded-xl border p-3 ${warn ? 'border-rose-200 bg-rose-50' : 'border-stone-200 bg-white'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <p className={`mt-0.5 font-mono text-2xl font-bold ${warn ? 'text-rose-600' : 'text-stone-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-stone-400">{sub}</p>}
    </div>
  );
  const n = (v: number | null, suffix = '') => (v == null ? '—' : `${v}${suffix}`);

  const shelfLow = m.peerLearning.shelfQuestions < m.peerLearning.shelfMinQuestions
    || m.peerLearning.shelfTips < m.peerLearning.shelfMinTips;

  return (
    <div className="min-h-screen bg-stone-50 p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="rounded-lg p-2 hover:bg-stone-100"><ArrowLeft className="h-5 w-5 text-stone-600" /></Link>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-900"><Rocket className="h-4 w-4 text-white" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-stone-900">Launch Dashboard</h1>
            <p className="text-xs text-stone-500">Last 24 hours · the only page that matters this month</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={busy}
            className="rounded-lg bg-white p-2 shadow-sm disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 text-stone-600 ${busy ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* ── Is the app WORKING? ── */}
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Is it working?</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tile('Crash-free students', n(m.reliability.crashFreePct, '%'),
              `${m.reliability.studentsWithErrors} hit an error`,
              m.reliability.crashFreePct != null && m.reliability.crashFreePct < 98)}
            {tile('Active today', String(m.reach.dau), `${m.reach.weeklyActive} this week`)}
            {tile('New students', String(m.reach.newStudents24), 'signed up in 24h')}
            {tile('Logged study', n(m.study.logRate, '%'), `${m.study.logged24} students`,
              m.study.logRate != null && m.study.logRate < 20)}
          </div>
        </section>

        {/* ── OTP: the front door ── */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-bold text-stone-900">Login door (OTP)</h2>
          <p className="mt-0.5 text-[11px] text-stone-500">
            The #1 predicted source of 1-star reviews. Sends vs accounts created — a big gap means codes are not arriving.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tile('OTP sends', String(m.otp.sends24))}
            {tile('Distinct phones', String(m.otp.distinctPhones24))}
            {tile('New accounts', String(m.otp.newAccounts24))}
            {tile('Students who got in', String(m.otp.loggedIn24))}
          </div>
        </section>

        {/* ── Where students come from ── */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-bold text-stone-900">Where students installed from</h2>
          <p className="mt-0.5 text-[11px] text-stone-500">
            Play Console shows installs; only this shows how each channel actually behaves.
            &ldquo;Unknown&rdquo; = signed up before this tracking existed.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-5">
            {Object.entries(m.installSource).map(([k, v]) => (
              <p key={k} className="flex justify-between text-[12px] text-stone-700">
                <span>{SOURCE_LABEL[k] ?? k}</span>
                <span className="font-mono font-bold">{v}</span>
              </p>
            ))}
          </div>
        </section>

        {/* ── Students helping students (NOT "community") ── */}
        <section className={`rounded-2xl border p-4 ${shelfLow ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white'}`}>
          <h2 className="text-sm font-bold text-stone-900">Students helping students</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tile('Daily Pick opens', n(m.peerLearning.openRate, '%'), `${m.peerLearning.dailyPickOpens} students`,
              m.peerLearning.openRate != null && m.peerLearning.openRate < 25)}
            {tile('Voted', n(m.peerLearning.voteRate, '%'), `${m.peerLearning.voters} of the openers`)}
            {tile('Tips shared', String(m.peerLearning.sharedTips24), 'in 24h')}
            {tile('Questions shared', String(m.peerLearning.sharedQuestions24), 'in 24h')}
          </div>
          <p className={`mt-2 text-[11px] font-semibold ${shelfLow ? 'text-amber-800' : 'text-stone-500'}`}>
            Shelf: {m.peerLearning.shelfQuestions} questions (min {m.peerLearning.shelfMinQuestions}) ·{' '}
            {m.peerLearning.shelfTips} tips (min {m.peerLearning.shelfMinTips})
            {shelfLow ? ' — below minimum; the recycler refills it on its next run.' : ' — healthy, auto-recycled daily.'}
          </p>
        </section>

        {/* ── Push ── */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-bold text-stone-900">Notifications</h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {tile('Pushes sent', String(m.push.sent24))}
            {tile('Opened', String(m.push.opened24))}
            {tile('Open rate', n(m.push.openRate, '%'))}
          </div>
          <p className="mt-2 text-[11px] text-stone-400">
            Counts only sends that stamp pushed_at — several paths still do not, so treat as a floor, not a total.
          </p>
        </section>

        {/* ── Crashes worth fixing ── */}
        {m.reliability.topCrashes.length > 0 && (
          <section className="rounded-2xl border border-rose-200 bg-white p-4">
            <h2 className="text-sm font-bold text-stone-900">Top errors (24h) — grouped</h2>
            <div className="mt-2 space-y-1.5">
              {m.reliability.topCrashes.map((c) => (
                <div key={c.fingerprint} className="flex items-start gap-2 border-b border-stone-50 pb-1.5 last:border-0">
                  <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-rose-700">
                    ×{c.count}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] text-stone-800">{c.message}</p>
                    <p className="text-[10px] text-stone-400">{c.path ?? 'unknown screen'}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
