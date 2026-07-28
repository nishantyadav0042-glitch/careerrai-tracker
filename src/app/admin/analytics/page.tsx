import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Activity } from 'lucide-react';

export const dynamic = 'force-dynamic';

// Real behaviour, from student_events.
//
// The tracking system has been recording every app open, screen view, log
// attempt and checkout step for days — 10k+ rows — and had NO admin surface at
// all. The DNA API routes existed with nothing calling them. This is that
// missing page: what students actually do, not what we hope they do.
//
// Test/founder accounts are excluded everywhere so the numbers are real.
const IST = 'Asia/Kolkata';
const DAYS = 14;

function istDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: IST });
}
function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) out.push(new Date(now - i * 86_400_000).toLocaleDateString('en-CA', { timeZone: IST }));
  return out;
}

type Row = { user_id: string | null; event: string; path: string | null; created_at: string };

export default async function AdminAnalyticsPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const sinceIso = new Date(Date.now() - DAYS * 86_400_000).toISOString();

  // ── Why this is paginated instead of one .limit(50_000) ────────────────────
  //
  // PostgREST caps a response server-side regardless of the .limit() asked
  // for, and this query had no .order(), so Postgres returned whatever slice
  // it liked — in practice the OLDEST rows in the window. The page then showed
  // "506 tracked events over 14 days" when there were more than 18,000, and
  // every recent day rendered as "0 open · 9 log": opens existed, they were
  // just past the cut. A dashboard that silently truncates is worse than no
  // dashboard, because you act on it.
  //
  // Explicit order + page until exhausted. Bounded by MAX_EVENT_PAGES so a
  // runaway table can never hang the admin page; if we ever hit that ceiling
  // the page says so rather than quietly under-reporting again.
  const PAGE = 1000;
  const MAX_EVENT_PAGES = 60; // 60k events
  async function fetchAllEvents() {
    const out: Row[] = [];
    let truncated = false;
    for (let page = 0; page < MAX_EVENT_PAGES; page++) {
      const { data } = await admin
        .from('student_events')
        .select('user_id, event, path, created_at')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      const batch = (data ?? []) as Row[];
      out.push(...batch);
      if (batch.length < PAGE) return { rows: out, truncated };
      if (page === MAX_EVENT_PAGES - 1) truncated = true;
    }
    return { rows: out, truncated };
  }

  const [{ rows: allEvents, truncated: eventsTruncated }, { data: students }, { data: reports }, { data: dna }] = await Promise.all([
    fetchAllEvents(),
    admin.from('profiles').select('id, role, is_test_account').eq('role', 'student'),
    admin.from('daily_reports').select('student_id, report_date').gte('report_date', istDay(sinceIso)),
    admin.from('student_dna').select('student_id, activation, consistency, momentum, purchase_intent, churn_risk, journey_stage'),
  ]);

  // Only real students count. A founder test account inflating "daily actives"
  // is how a dashboard starts lying to you.
  const real = new Set((students ?? []).filter((s) => s.is_test_account !== true).map((s) => s.id));
  const rows = allEvents.filter((e) => e.user_id && real.has(e.user_id));

  const days = lastNDays(DAYS);
  const openers = new Map<string, Set<string>>();
  const loggers = new Map<string, Set<string>>();

  for (const d of days) { openers.set(d, new Set()); loggers.set(d, new Set()); }

  // ONE definition of "opened the app", shared with /admin/launch: an app_open
  // event. This counted ANY event, so the two dashboards disagreed — by one
  // student on 2 of the last 8 days, which is small but is exactly the drift
  // that makes people stop trusting both numbers. A student who fires a tap or
  // a screen_view without an app_open is a telemetry gap to fix at the source,
  // not a second definition of active.
  for (const e of rows) {
    if (e.event !== 'app_open') continue;
    const d = istDay(e.created_at);
    if (!openers.has(d)) continue;
    openers.get(d)!.add(e.user_id!);
  }
  for (const r of reports ?? []) {
    const d = r.report_date as string;
    if (loggers.has(d) && real.has(r.student_id as string)) loggers.get(d)!.add(r.student_id as string);
  }

  // Screens, by distinct students (not raw views — one obsessive refresher
  // shouldn't outrank a screen fifty people actually opened).
  const byPath = new Map<string, Set<string>>();
  for (const e of rows) {
    if (e.event !== 'pageview' || !e.path) continue;
    if (!byPath.has(e.path)) byPath.set(e.path, new Set());
    byPath.get(e.path)!.add(e.user_id!);
  }
  const topPaths = [...byPath.entries()].map(([p, s]) => ({ path: p, students: s.size }))
    .sort((a, b) => b.students - a.students).slice(0, 10);

  const distinct = (ev: string) => new Set(rows.filter((e) => e.event === ev).map((e) => e.user_id!)).size;

  const payFunnel = [
    { label: 'Saw the paywall', n: distinct('buddy_unlock_open') },
    { label: 'Tapped a plan', n: distinct('buddy_plan_click') },
    { label: 'Order created', n: distinct('pay_order_created') },
    { label: 'Checkout opened', n: distinct('pay_checkout_opened') },
    { label: 'Payment failed', n: distinct('pay_failed'), bad: true },
    { label: 'Payment succeeded', n: distinct('pay_success_callback') },
  ];

  const logFunnel = [
    { label: 'Opened the log', n: distinct('log_open') },
    { label: 'Blocked by validation', n: distinct('log_blocked'), bad: true },
    { label: 'Abandoned it', n: distinct('log_dismissed'), bad: true },
    { label: 'Completed a log', n: distinct('daily_log') },
  ];

  const dnaRows = (dna ?? []).filter((d) => real.has(d.student_id as string));
  const stages = new Map<string, number>();
  for (const d of dnaRows) stages.set((d.journey_stage as string) ?? 'unknown', (stages.get((d.journey_stage as string) ?? 'unknown') ?? 0) + 1);
  const avg = (k: keyof typeof dnaRows[number]) =>
    dnaRows.length ? Math.round(dnaRows.reduce((s, d) => s + (Number(d[k]) || 0), 0) / dnaRows.length) : 0;

  const peak = Math.max(1, ...days.map((d) => openers.get(d)!.size));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-1 flex items-center gap-2">
        <Activity className="h-5 w-5 text-stone-900" />
        <h1 className="text-2xl font-bold text-stone-900">Analytics</h1>
      </div>
      <p className="mb-6 text-sm text-stone-500">
        What students actually do, from {rows.length.toLocaleString('en-IN')} tracked events over the last {DAYS} days.
        {eventsTruncated && (
          <span className="font-semibold text-amber-700">
            {' '}Capped at {(MAX_EVENT_PAGES * PAGE).toLocaleString('en-IN')} events — figures below are an undercount.
          </span>
        )}
        Test accounts excluded.
      </p>

      {/* Opens vs logs — the gap that daily-log counts alone never showed. */}
      <section className="mb-8 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-stone-400">Opened the app vs logged</h2>
        <p className="mt-1 mb-4 text-xs text-stone-500">
          Most students who open CareerRai never log. Daily-log counts alone hide them entirely.
        </p>
        <div className="space-y-1.5">
          {days.map((d) => {
            const o = openers.get(d)!.size;
            const l = loggers.get(d)!.size;
            return (
              <div key={d} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 tabular-nums text-stone-500">{d.slice(5)}</span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-stone-100">
                  <div className="absolute inset-y-0 left-0 bg-stone-300" style={{ width: `${(o / peak) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${(l / peak) * 100}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right tabular-nums font-semibold text-stone-700">
                  {o} open · {l} log
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-stone-400">Grey = opened the app · Green = also logged that day</p>
      </section>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <FunnelCard title="Payment funnel" note="Distinct students, last 14 days" items={payFunnel} />
        <FunnelCard title="Daily-log funnel" note="Distinct students, last 14 days" items={logFunnel} />
      </div>

      <section className="mb-8 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-stone-400">Most-opened screens</h2>
        {topPaths.length === 0 ? (
          <p className="text-sm text-stone-500">No pageviews recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {topPaths.map((p) => (
              <div key={p.path} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-mono text-xs text-stone-600">{p.path}</span>
                <span className="shrink-0 font-semibold tabular-nums text-stone-900">{p.students}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-widest text-stone-400">Student DNA</h2>
        <p className="mb-4 text-xs text-stone-500">
          {dnaRows.length} students scored. Recomputed every 3 hours.
        </p>
        {dnaRows.length === 0 ? (
          <p className="text-sm text-stone-500">No DNA computed yet — the compute-dna cron hasn&apos;t run.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {([['Activation', 'activation'], ['Consistency', 'consistency'], ['Momentum', 'momentum'], ['Buy intent', 'purchase_intent'], ['Churn risk', 'churn_risk']] as const).map(([label, key]) => (
                <div key={key} className="rounded-xl bg-stone-50 p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-stone-900">{avg(key as never)}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...stages.entries()].sort((a, b) => b[1] - a[1]).map(([stage, n]) => (
                <span key={stage} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                  {stage} · {n}
                </span>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function FunnelCard({ title, note, items }: {
  title: string; note: string; items: { label: string; n: number; bad?: boolean }[];
}) {
  const top = Math.max(1, ...items.map((i) => i.n));
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-bold uppercase tracking-widest text-stone-400">{title}</h2>
      <p className="mt-1 mb-4 text-xs text-stone-500">{note}</p>
      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.label}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-600">{i.label}</span>
              <span className={`font-bold tabular-nums ${i.bad && i.n > 0 ? 'text-rose-600' : 'text-stone-900'}`}>{i.n}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-stone-100">
              <div className={i.bad ? 'h-full bg-rose-400' : 'h-full bg-stone-800'} style={{ width: `${(i.n / top) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
