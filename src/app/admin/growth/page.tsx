import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AD_CHANNELS, CHANNEL_LABEL, type AdChannel } from '@/lib/attribution';
import { TrendingUp } from 'lucide-react';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;
function daysAgoIso(n: number) {
  return new Date(Date.now() - n * DAY).toISOString();
}
function istDay(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

export default async function AdminGrowthPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const [{ data: profiles }, { data: streaks }, { data: engagement }, { data: funnel }] = await Promise.all([
    admin.from('profiles').select('id, role, created_at, onboarding_completed, subscription_status, signup_source, is_test_account, attr_channel, attr_source, attr_campaign, attr_stamped_at'),
    admin.from('streak_data').select('student_id, last_log_date'),
    admin.from('student_engagement').select('student_id, buddy_cta_clicks'),
    admin.from('funnel_events').select('step, anon_id').gte('created_at', daysAgoIso(30)),
  ]);

  // Test/friend accounts (is_test_account) are excluded from every funnel
  // number so founder testing never inflates acquisition/activation metrics.
  const students = (profiles ?? []).filter((p) => p.role === 'student' && p.is_test_account !== true);
  const lastLog = new Map<string, string | null>((streaks ?? []).map((s) => [s.student_id, s.last_log_date]));
  const ctaClicks = new Map<string, number>((engagement ?? []).map((e) => [e.student_id, e.buddy_cta_clicks ?? 0]));

  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const now = Date.now();
  const within = (iso: string | null | undefined, days: number) => !!iso && now - Date.parse(iso) <= days * DAY;

  // ── The funnel ──────────────────────────────────────────────────────────
  const total = students.length;
  const onboarded = students.filter((s) => s.onboarding_completed === true).length;
  const logged = students.filter((s) => !!lastLog.get(s.id)).length;
  const active7 = students.filter((s) => within(lastLog.get(s.id), 7)).length;
  const buddyIntent = students.filter((s) => (ctaClicks.get(s.id) ?? 0) > 0).length;
  const paid = students.filter((s) => s.subscription_status === 'active').length;

  const stages = [
    { label: 'Signed up', count: total, tone: '#0f766e' },
    { label: 'Finished onboarding', count: onboarded, tone: '#2563eb' },
    { label: 'Logged ≥1 session', count: logged, tone: '#7c3aed' },
    { label: 'Active (last 7 days)', count: active7, tone: '#ea580c' },
    { label: 'Reached for a buddy', count: buddyIntent, tone: '#db2777' },
    { label: 'Paid', count: paid, tone: '#059669' },
  ];

  // ── Acquisition windows ─────────────────────────────────────────────────
  const signups7 = students.filter((s) => within(s.created_at, 7)).length;
  const signups30 = students.filter((s) => within(s.created_at, 30)).length;

  // ── Daily signups, last 14 days ─────────────────────────────────────────
  const dayKeys: string[] = [];
  for (let i = 13; i >= 0; i--) dayKeys.push(istDay(new Date(now - i * DAY)));
  const perDay = new Map<string, number>(dayKeys.map((k) => [k, 0]));
  for (const s of students) {
    if (!s.created_at) continue;
    const k = istDay(new Date(s.created_at));
    if (perDay.has(k)) perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const maxDay = Math.max(1, ...dayKeys.map((k) => perDay.get(k) ?? 0));

  // ── By acquisition source ───────────────────────────────────────────────
  const bySource = new Map<string, { n: number; onboarded: number; paid: number }>();
  for (const s of students) {
    const key = (s.signup_source && String(s.signup_source).trim()) || 'unknown';
    const row = bySource.get(key) ?? { n: 0, onboarded: 0, paid: 0 };
    row.n += 1;
    if (s.onboarding_completed) row.onboarded += 1;
    if (s.subscription_status === 'active') row.paid += 1;
    bySource.set(key, row);
  }
  const sources = [...bySource.entries()].sort((a, b) => b[1].n - a[1].n);

  // ── Which ad paid for the lead ──────────────────────────────────────────
  //
  // Two "no channel" cases that must never be added together:
  //
  //   attr_stamped_at is null — the row predates attribution shipping, so we
  //   simply never looked. Not evidence of anything.
  //   channel 'direct' — we did look, and there was no ad marker.
  //
  // Merging them would quietly turn "we weren't measuring yet" into "these
  // people came direct", which is the kind of number that survives into a
  // budget decision precisely because it looks like data.
  const byChannel = new Map<AdChannel, { n: number; onboarded: number; paid: number }>();
  let untracked = 0;
  for (const s of students) {
    if (!s.attr_stamped_at) { untracked += 1; continue; }
    const key = (AD_CHANNELS as readonly string[]).includes(String(s.attr_channel))
      ? (s.attr_channel as AdChannel)
      : 'direct';
    const row = byChannel.get(key) ?? { n: 0, onboarded: 0, paid: 0 };
    row.n += 1;
    if (s.onboarding_completed) row.onboarded += 1;
    if (s.subscription_status === 'active') row.paid += 1;
    byChannel.set(key, row);
  }
  const channels = [...byChannel.entries()].sort((a, b) => b[1].n - a[1].n);
  const tracked = students.length - untracked;

  // ── Is capture actually working? ────────────────────────────────────────
  //
  // The question this answers is "is the pipe connected", which is NOT the
  // same as "are the ads working". A stretch of signups where every tracked
  // row says direct is the signature of a broken cookie/tag, and it looks
  // identical to genuinely untagged traffic unless you name the difference.
  const recent = students
    .filter((s) => within(s.created_at, 14) && s.attr_stamped_at)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const recentWithSignal = recent.filter((s) => s.attr_channel && s.attr_channel !== 'direct');
  const lastSignal = recentWithSignal[0]?.created_at ?? null;
  const captureLive = tracked > 0;

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const onboardDrop = total - onboarded;

  // ── Pre-signup /start funnel (anonymous visitors) ───────────────────────
  const FUNNEL_ORDER: [string, string][] = [
    ['start:landed', 'Opened the page'],
    ['start:need-check', 'Reached screen 1 (need check)'],
    ['start:target-date', 'Target date'],
    ['start:dream-percentile', 'Dream percentile'],
    ['start:quick-facts', 'Quick facts'],
    ['start:pain-points', 'Pain points'],
    ['start:reassurance', 'Reassurance'],
    ['start:topic-coverage', 'Topic mapping (53 taps)'],
    ['start:mentor', 'Mentor'],
    ['start:login-build', 'Signup screen'],
  ];
  const anonByStep = new Map<string, Set<string>>();
  for (const e of funnel ?? []) {
    const set = anonByStep.get(e.step) ?? new Set<string>();
    if (e.anon_id) set.add(e.anon_id);
    anonByStep.set(e.step, set);
  }
  const funnelStages = FUNNEL_ORDER.map(([key, label]) => ({ label, count: anonByStep.get(key)?.size ?? 0 }));
  const funnelTop = funnelStages[0]?.count ?? 0;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-5 h-5 text-teal-700" />
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>Growth &amp; Funnel</h1>
        </div>
        <p className="text-sm text-stone-500 mb-6">Where students come in, and where they drop off. Live.</p>

        {/* Top stats */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { k: 'Signups (7d)', v: signups7 },
            { k: 'Signups (30d)', v: signups30 },
            { k: 'Total students', v: total },
          ].map((s) => (
            <div key={s.k} className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-2xl font-bold text-stone-900 tabular-nums">{s.v}</p>
              <p className="text-[11px] uppercase tracking-wide text-stone-400 font-semibold mt-0.5">{s.k}</p>
            </div>
          ))}
        </div>

        {/* Onboarding drop-off callout */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-6">
          <p className="text-sm text-amber-900">
            <b>{onboardDrop}</b> of <b>{total}</b> signups didn&apos;t finish onboarding
            {' '}(<b>{pct(onboardDrop, total)}%</b> drop-off). Onboarding completion: <b>{pct(onboarded, total)}%</b>.
          </p>
        </div>

        {/* Funnel */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 mb-6">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">The funnel</p>
          <div className="space-y-3">
            {stages.map((st, i) => {
              const ofTotal = pct(st.count, total);
              const ofPrev = i === 0 ? 100 : pct(st.count, stages[i - 1].count);
              return (
                <div key={st.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-stone-800">{st.label}</span>
                    <span className="tabular-nums text-stone-500">
                      <b className="text-stone-900">{st.count}</b> · {ofTotal}% of signups
                      {i > 0 && <span className="text-stone-400"> · {ofPrev}% from prev</span>}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-stone-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, ofTotal)}%`, background: st.tone }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pre-signup /start funnel (anonymous) */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 mb-6">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-1">Onboarding funnel · /start visitors</p>
          <p className="text-[11px] text-stone-400 mb-4">Distinct anonymous visitors reaching each screen (last 30 days). The big gap is where you lose them.</p>
          {funnelTop > 0 ? (
            <div className="space-y-3">
              {funnelStages.map((st, i) => {
                const ofTop = pct(st.count, funnelTop);
                const ofPrev = i === 0 ? 100 : pct(st.count, funnelStages[i - 1].count);
                const bigDrop = i > 0 && ofPrev < 70 && st.count > 0;
                return (
                  <div key={st.label}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-stone-800">{st.label}</span>
                      <span className="tabular-nums text-stone-500">
                        <b className="text-stone-900">{st.count}</b> · {ofTop}%
                        {i > 0 && <span className={bigDrop ? 'text-rose-600 font-semibold' : 'text-stone-400'}> · {ofPrev}% kept</span>}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-stone-100 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(2, ofTop)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-stone-400 py-2">No funnel data yet — it starts collecting as visitors hit /start. Give it a little traffic.</p>
          )}
        </div>

        {/* Daily signups */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 mb-6">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Signups · last 14 days</p>
          <div className="flex items-end gap-1.5 h-24">
            {dayKeys.map((k) => {
              const v = perDay.get(k) ?? 0;
              return (
                <div key={k} className="flex-1 flex flex-col items-center gap-1" title={`${k}: ${v}`}>
                  <div className="w-full rounded-t bg-teal-600/90" style={{ height: `${(v / maxDay) * 100}%`, minHeight: v > 0 ? 4 : 0 }} />
                  <span className="text-[9px] text-stone-400 tabular-nums">{k.slice(8)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Which ad paid for the lead */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 mb-6">
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Where leads come from</p>
            <span className="text-[11px] text-stone-400 tabular-nums">{tracked} tracked</span>
          </div>

          {/* Capture health — "is the pipe connected", answered before any number
              below is trusted. A channel table that silently reports zeros is
              indistinguishable from one that is measuring correctly. */}
          {!captureLive ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">Capture not confirmed yet</p>
              <p className="text-[12.5px] text-amber-800 mt-1">
                No signup has been stamped with attribution yet. That is expected until the first person signs up
                after this shipped — every existing student predates it. Send yourself a test click with
                <code className="mx-1 rounded bg-amber-100 px-1">?utm_source=google&amp;utm_medium=cpc</code>
                and sign up to confirm the whole path end to end.
              </p>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-sm font-semibold text-stone-900">
                Capture is live · {recentWithSignal.length} of {recent.length} signups in the last 14 days carried an ad marker
              </p>
              <p className="text-[12.5px] text-stone-600 mt-1">
                {lastSignal
                  ? `Last attributed signup: ${istDay(new Date(lastSignal))}.`
                  : 'No attributed signup in the last 14 days — if ads are running right now, check that the landing URLs still carry their utm tags.'}
              </p>
            </div>
          )}

          <div className="space-y-1.5 mt-4">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-[11px] uppercase tracking-wide text-stone-400 font-semibold px-1">
              <span>Channel</span><span className="text-right">Leads</span><span className="text-right">Onboarded</span><span className="text-right">Paid</span>
            </div>
            {channels.map(([ch, r]) => (
              <Link
                key={ch}
                href={`/admin/growth/channel/${ch}`}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-sm px-1 py-1.5 border-t border-stone-100 hover:bg-stone-50"
              >
                <span className="text-stone-800 truncate">
                  {CHANNEL_LABEL[ch]}
                  {ch === 'meta_link' && (
                    <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">can&apos;t confirm paid</span>
                  )}
                </span>
                <span className="text-right tabular-nums text-stone-900 font-semibold">{r.n}</span>
                <span className="text-right tabular-nums text-stone-500">{r.onboarded} ({pct(r.onboarded, r.n)}%)</span>
                <span className="text-right tabular-nums text-stone-500">{r.paid}</span>
              </Link>
            ))}
            {channels.length === 0 && <p className="text-sm text-stone-400 py-2">Nothing tracked yet.</p>}
            {untracked > 0 && (
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-sm px-1 py-1.5 border-t border-stone-100 text-stone-400">
                <span className="truncate">Signed up before tracking existed</span>
                <span className="text-right tabular-nums">{untracked}</span>
                <span /><span />
              </div>
            )}
          </div>

          <p className="text-[11px] text-stone-400 mt-3">
            Tap a channel to see exactly which students it brought. <b>Meta link</b> is counted separately on purpose:
            Facebook and Instagram add <code className="rounded bg-stone-100 px-1">fbclid</code> to organic posts and
            shares too, so it is not proof of a paid click. Add
            <code className="mx-1 rounded bg-stone-100 px-1">utm_medium=cpc</code> to your Meta ad URLs and those clicks
            move into Meta Ads.
          </p>
        </div>

        {/* By source */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3">How the account was created</p>
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-[11px] uppercase tracking-wide text-stone-400 font-semibold px-1">
              <span>Source</span><span className="text-right">Signups</span><span className="text-right">Onboarded</span><span className="text-right">Paid</span>
            </div>
            {sources.map(([src, r]) => (
              <div key={src} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-sm px-1 py-1 border-t border-stone-100">
                <span className="text-stone-800 truncate">{src}</span>
                <span className="text-right tabular-nums text-stone-900 font-semibold">{r.n}</span>
                <span className="text-right tabular-nums text-stone-500">{r.onboarded} ({pct(r.onboarded, r.n)}%)</span>
                <span className="text-right tabular-nums text-stone-500">{r.paid}</span>
              </div>
            ))}
            {sources.length === 0 && <p className="text-sm text-stone-400 py-2">No students yet.</p>}
          </div>
          <p className="text-[11px] text-stone-400 mt-3">
            This is the account-creation route (self-signup vs allowlist), not an ad channel — which is why almost
            everything lands in one bucket. For which ad paid for the lead, use <b>Where leads come from</b> above.
          </p>
        </div>
      </div>
    </div>
  );
}
