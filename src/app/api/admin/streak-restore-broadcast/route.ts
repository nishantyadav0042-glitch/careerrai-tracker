import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';
import { momentumStreak } from '@/lib/streak-utils';
import { authorizedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// One-tap Momentum Shield announcement (founder, 20 July). Two messages, one
// goal — get students logging daily:
//   * students who ever logged  → "your streak is RESTORED (N days, shields),
//     start from today"
//   * students who never logged → "3 shields are waiting, streaks never reset —
//     start tonight"
// In-app notification for EVERY real student (the bell always shows it); web
// push on top for everyone whose notifications are on.
//
// Idempotent per channel: the in-app row is created once ('streak_restored'),
// and a successful push is recorded once ('streak_restored_push' marker) —
// so re-runs only fill whatever a previous run missed, never duplicate.
//
// Two entrances, same job: POST (admin session — the dashboard button) and
// GET (Vercel cron / CRON_SECRET — lets the announcement fire server-side
// where the push keys live, without waiting for an admin tap).
async function runBroadcast() {
  const admin = createAdminClient();

  const [{ data: students }, { data: streaks }, { data: markers }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, notif_prefs, push_subscription')
      .eq('role', 'student')
      .not('is_test_account', 'is', true)
      .not('is_demo', 'is', true),
    admin.from('streak_data').select('student_id, current_streak, shields, last_log_date'),
    admin.from('notifications').select('user_id, type, pushed_at').in('type', ['streak_restored', 'streak_restored_push']),
  ]);

  const streakById = new Map((streaks ?? []).map((s) => [s.student_id as string, s]));
  const hasInApp = new Set((markers ?? []).filter((n) => n.type === 'streak_restored').map((n) => n.user_id as string));
  // Was row EXISTENCE. dispatch() now creates a streak_restored_push row for
  // every ATTEMPT, not only successful ones (that used to be this script's own
  // job — it inserted the marker itself, and only after res.ok). Filtering on
  // pushed_at keeps the original meaning: "already confirmed delivered",
  // so a failed attempt is still retried on the next sweep instead of being
  // mistaken for done.
  const hasPush = new Set(
    (markers ?? []).filter((n) => n.type === 'streak_restored_push' && n.pushed_at != null).map((n) => n.user_id as string)
  );

  let inApp = 0;
  let pushed = 0;
  let skipped = 0;

  for (const s of students ?? []) {
    const first = ((s.full_name as string | null) ?? '').trim().split(' ')[0] || 'there';
    const st = streakById.get(s.id);
    const m = momentumStreak(
      st?.current_streak as number | null,
      st?.shields as number | null,
      (st?.last_log_date as string | null) ?? null
    );
    const everLogged = (st?.last_log_date ?? null) != null;

    let title: string;
    let body: string;
    if (everLogged && m.streak >= 1) {
      title = `🔥 ${first}, your streak is restored`;
      body = `Your ${m.streak}-day streak is back — protected by ${m.shields} Momentum Shield${m.shields === 1 ? '' : 's'}. Streaks never reset to zero now. Log today and keep it climbing.`;
    } else if (everLogged) {
      title = `🛡️ ${first}, your streak is protected now`;
      body = `Streaks never reset to zero anymore — Momentum Shields cover your missed days. Start again tonight: one log and you're building again.`;
    } else {
      title = `🛡️ 3 Momentum Shields are waiting, ${first}`;
      body = `New: your streak can never reset to zero. Miss a day — a shield covers it. Start tonight: your first log takes 15 seconds.`;
    }

    // Through dispatch(), once ever. This wrote a bell row by hand and then
    // dispatched a SECOND row for the push — two records of one announcement.
    // One dispatch now creates the row and pushes it, so "was this student
    // told?" has a single answer. The once-ever guard is unchanged.
    if (!hasInApp.has(s.id)) {
      const outcome = await dispatch({
        userId: s.id,
        type: 'streak_restored',
        title,
        body,
        url: '/student/tracker',
        reason: 'Momentum Shields announcement — told once, ever',
        expectedAction: 'log_today',
        prefs: (s.notif_prefs ?? {}) as Record<string, unknown>,
      });
      if (outcome === 'sent' || outcome === 'failed') inApp++;
    }

    // Web push, once ever — only where notifications are on. dispatch() now
    // creates its own real streak_restored_push row (title/body = the actual
    // message, not a placeholder marker) and stamps pushed_at on success —
    // the ledger entry IS the record of "this was sent", replacing the
    // separate marker insert this file used to write by hand.
    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.push === true && s.push_subscription != null && !hasPush.has(s.id)) {
      const outcome = await dispatch({
        userId: s.id, type: 'streak_restored_push', title, body, url: '/student/tracker',
        reason: 'Momentum Shields launch — one-time streak-restored announcement', expectedAction: 'log_today',
        prefs,
      }).catch(() => null);
      if (outcome === 'sent') pushed++;
    } else if (hasInApp.has(s.id) && (hasPush.has(s.id) || prefs.push !== true)) {
      skipped++;
    }
  }

  return { ok: true, inApp, pushed, skipped };
}

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await runBroadcast());
}

export async function GET(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await runBroadcast());
}
