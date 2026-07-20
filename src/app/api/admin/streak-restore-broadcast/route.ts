import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { momentumStreak } from '@/lib/streak-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// One-tap Momentum Shield announcement (founder, 20 July). Two messages, one
// goal — get students logging daily:
//   * students who ever logged  → "your streak is RESTORED (N days, shields),
//     start from today"
//   * students who never logged → "3 shields are waiting, streaks never reset —
//     start tonight"
// In-app notification for EVERY real student (the bell always shows it); web
// push on top for everyone whose notifications are on. Idempotent: a student
// who already holds a 'streak_restored' notification is never sent twice, so
// re-tapping the button only reaches students missed by a previous run.
export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [{ data: students }, { data: streaks }, { data: already }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, notif_prefs, push_subscription')
      .eq('role', 'student')
      .not('is_test_account', 'is', true)
      .not('is_demo', 'is', true),
    admin.from('streak_data').select('student_id, current_streak, shields, last_log_date'),
    admin.from('notifications').select('user_id').eq('type', 'streak_restored'),
  ]);

  const streakById = new Map((streaks ?? []).map((s) => [s.student_id as string, s]));
  const done = new Set((already ?? []).map((n) => n.user_id as string));

  let inApp = 0;
  let pushed = 0;
  let skipped = 0;

  for (const s of students ?? []) {
    if (done.has(s.id)) { skipped++; continue; }
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

    const { error } = await admin.from('notifications').insert({
      user_id: s.id,
      type: 'streak_restored',
      title,
      body,
      data: { url: '/student/tracker' },
      read: false,
      channel: 'in_app',
    });
    if (error) continue;
    inApp++;

    const prefs = (s.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.push === true && s.push_subscription != null) {
      const res = await sendPushToUser(s.id, { title, body, url: '/student/tracker' }).catch(() => null);
      if (res?.ok) pushed++;
    }
  }

  return NextResponse.json({ ok: true, inApp, pushed, skipped });
}
