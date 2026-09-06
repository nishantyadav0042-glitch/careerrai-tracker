import { NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/require-admin';
import { MIN_ACTIVE_QUESTIONS, MIN_ACTIVE_TIPS } from '@/lib/community-pipeline';

import { fetchAll } from '@/lib/supabase/fetch-all';
export const maxDuration = 60;

// The Launch Dashboard numbers — the one page the founder opens each morning
// during the first 30 days. Every figure is derived from data we actually
// hold; anything too thin to be honest returns null and the UI shows a dash
// rather than a made-up percentage.

export async function GET() {
  const ctx = await requireAdminCtx();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  const since24 = new Date(Date.now() - 86_400_000).toISOString();
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

  const [
    { data: ev24 }, { data: otp24 }, { data: errs24 },
    { data: sources }, { data: logs24 }, { data: votes24 },
    { data: subs24 }, { data: notifs24 }, { data: shelf },
  ] = await Promise.all([
    fetchAll(() => admin.from('student_events').select('user_id, event').gte('created_at', since24)),
    // OTP sends. This queried `created_at` — a column that does not exist on
    // this table; it is `sent_at`. PostgREST rejected the filter, the route
    // swallowed it, and the whole "Login door (OTP)" panel rendered confident
    // zeros. It also counted distinct `phone`, which is NULL in all 423 rows:
    // the phone path records the send inside the claim_otp_send_slot RPC and
    // the email path writes `email`, so `phone` has never held a value.
    // Distinct RECIPIENT now spans both columns.
    fetchAll(() => admin.from('otp_send_events').select('phone, email, sent_at').gte('sent_at', since24)),
    // Crashes only. `source = 'handled'` rows are errors we CAUGHT and showed
    // the student (lib/report-error.ts) — real signal, but not crashes, and
    // counting them here would silently redefine crash_free_pct against its
    // metric-registry definition ("students with zero client errors") the day
    // handled reporting shipped. A retried "Failed to fetch" is not a crash.
    //
    // `source IS NULL OR source <> 'handled'`, not a bare `.neq()`. The column
    // is nullable with no default, and in SQL `NULL <> 'handled'` is NULL, not
    // true — so a bare neq() drops NULL-source rows. Every row today is written
    // by /api/client-error, which always sets a source, but a crash silently
    // vanishing from a CRASH metric fails in the flattering direction: the
    // number goes UP and nobody goes looking.
    fetchAll(() => admin.from('client_errors').select('student_id, fingerprint, message, path, install_source, created_at')
      .gte('created_at', since24).or('source.is.null,source.neq.handled')),
    fetchAll(() => admin.from('profiles').select('install_source, created_at, is_test_account')),
    fetchAll(() => admin.from('daily_reports').select('student_id, report_date').gte('created_at', since24)),
    fetchAll(() => admin.from('submission_votes').select('student_id').gte('created_at', since24)),
    fetchAll(() => admin.from('student_submissions').select('kind, status, created_at')),
    // Push funnel, three real stages. NOT read_at — nothing in the codebase
    // has ever written that column (the only read_at writers are chat and
    // voice notes), so this tile showed 0 opens forever no matter what
    // students did. The service worker beacons the truth: received_at when
    // the push lands on the device, clicked_at when it is tapped.
    fetchAll(() => admin.from('notifications').select('id, pushed_at, received_at, clicked_at, created_at').gte('created_at', since24)),
    fetchAll(() => admin.from('student_submissions').select('kind, status')),
  ]);

  // ── Reach ──
  const dauSet = new Set((ev24 ?? []).filter((e) => e.event === 'app_open').map((e) => e.user_id as string));
  const anyEventUsers = new Set((ev24 ?? []).map((e) => e.user_id as string));
  const dau = dauSet.size || anyEventUsers.size;

  // ── Crash-free: students with zero client errors, out of students seen ──
  const crashed = new Set((errs24 ?? []).map((e) => e.student_id as string).filter(Boolean));
  const crashFreePct = dau > 0 ? Math.round(((dau - crashed.size) / dau) * 100) : null;

  // Top crash groups, so a real bug is one line not 200.
  const groups = new Map<string, { count: number; message: string; path: string | null }>();
  for (const e of errs24 ?? []) {
    const k = e.fingerprint as string;
    const g = groups.get(k) ?? { count: 0, message: e.message as string, path: (e.path as string) ?? null };
    g.count += 1;
    groups.set(k, g);
  }
  const topCrashes = [...groups.entries()]
    .map(([fingerprint, g]) => ({ fingerprint, ...g }))
    .sort((a, b) => b.count - a.count).slice(0, 5);

  // ── OTP: sends vs students who actually got in ──
  const otpSends = (otp24 ?? []).length;
  // Was a second, byte-identical copy of the DAU computation above, presented
  // under a different label — "Students who got in" and "Active today" were
  // always the same number by construction, so the OTP funnel could never
  // show a gap no matter how badly login was failing. One definition, one
  // value, used twice; if they must differ, they need different sources.
  const loggedIn24 = dauSet.size;
  const newStudents24 = (sources ?? []).filter((p) => !p.is_test_account && (p.created_at as string) >= since24).length;
  // Honest framing: distinct phones sent vs new accounts created. Not a true
  // per-attempt success rate (we don't log verify failures yet) — labelled as
  // such in the UI.
  const otpPhones = new Set(
    (otp24 ?? []).map((o) => (o.phone as string | null) ?? (o.email as string | null)).filter(Boolean)
  ).size;

  // ── Install source split (the Play vs web question) ──
  const real = (sources ?? []).filter((p) => !p.is_test_account);
  const bySource: Record<string, number> = { play: 0, pwa: 0, ios: 0, browser: 0, unknown: 0 };
  for (const p of real) {
    const k = (p.install_source as string) ?? 'unknown';
    bySource[k] = (bySource[k] ?? 0) + 1;
  }

  // ── Study behaviour ──
  const loggedStudents24 = new Set((logs24 ?? []).map((l) => l.student_id as string)).size;

  // ── Peer-learning layer ──
  const openers = new Set((ev24 ?? []).filter((e) => e.event === 'daily_pick_open').map((e) => e.user_id as string)).size;
  const voters = new Set((votes24 ?? []).map((v) => v.student_id as string)).size;
  const sharedTips24 = (subs24 ?? []).filter((s) => s.kind === 'tip' && (s.created_at as string) >= since24).length;
  const sharedQs24 = (subs24 ?? []).filter((s) => s.kind === 'question' && (s.created_at as string) >= since24).length;

  const activeOf = (kind: string) => (shelf ?? []).filter((s) =>
    s.kind === kind && s.status === 'live').length;

  // ── Push: three stages, because two of them fail independently ──
  // Sent ≠ delivered. Roughly a third of pushes handed to Google's service
  // never reach the device (Doze, battery optimisation, dead subscriptions),
  // and that loss is invisible if you only count sends.
  const pushed = (notifs24 ?? []).filter((n) => n.pushed_at != null).length;
  // A TAP PROVES DELIVERY. 22 of 43 lifetime taps have clicked_at with no
  // received_at: the notificationclick beacon fired but the push-arrival
  // beacon did not (device offline when it landed, beacon dropped, or the
  // notification predates the v6 service worker). Counting only received_at
  // both under-reports delivery and produces an incoherent ratio — a tap rate
  // whose numerator is not a subset of its denominator.
  const delivered = (n: { received_at?: unknown; clicked_at?: unknown }) =>
    n.received_at != null || n.clicked_at != null;
  const pushDelivered = (notifs24 ?? []).filter(delivered).length;
  const pushOpened = (notifs24 ?? []).filter((n) => n.clicked_at != null).length;

  // ── Retention: students seen in the last 7 days who were also seen today ──
  const { data: ev7 } = await fetchAll(() => admin.from('student_events')
    .select('user_id').eq('event', 'app_open').gte('created_at', since7d));
  const weekly = new Set((ev7 ?? []).map((e) => e.user_id as string));

  return NextResponse.json({
    reach: { dau, weeklyActive: weekly.size, newStudents24 },
    reliability: {
      crashFreePct,
      studentsWithErrors: crashed.size,
      errorReports24: (errs24 ?? []).length,
      topCrashes,
    },
    otp: { sends24: otpSends, distinctPhones24: otpPhones, newAccounts24: newStudents24, loggedIn24 },
    installSource: bySource,
    study: { logged24: loggedStudents24, logRate: pct(loggedStudents24, dau) },
    peerLearning: {
      dailyPickOpens: openers, openRate: pct(openers, dau),
      voters, voteRate: pct(voters, openers),
      sharedTips24, sharedQuestions24: sharedQs24,
      shelfQuestions: activeOf('question'), shelfTips: activeOf('tip'),
      shelfMinQuestions: MIN_ACTIVE_QUESTIONS, shelfMinTips: MIN_ACTIVE_TIPS,
    },
    push: {
      sent24: pushed,
      delivered24: pushDelivered,
      opened24: pushOpened,
      deliveryRate: pct(pushDelivered, pushed),
      openRate: pct(pushOpened, pushDelivered), // of DELIVERED — the honest denominator
    },
  });
}
