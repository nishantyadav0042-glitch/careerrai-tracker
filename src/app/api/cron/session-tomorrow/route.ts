import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { authorizedCron } from '@/lib/cron-auth';

// Runs at 06:00 UTC (11:30 AM IST) — catches sessions scheduled for tomorrow IST.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Tomorrow window in IST (UTC+5:30)
  const nowMs = Date.now();
  const tomorrowStart = new Date(nowMs + 24 * 3_600_000);
  const tomorrowEnd = new Date(nowMs + 48 * 3_600_000);

  const { data: sessions } = await admin
    .from('video_sessions')
    .select('id, student_id, buddy_id, scheduled_at, title')
    .eq('session_status', 'scheduled')
    .gte('scheduled_at', tomorrowStart.toISOString())
    .lt('scheduled_at', tomorrowEnd.toISOString());

  if (!sessions?.length) return NextResponse.json({ notified: 0 });

  let notified = 0;
  for (const session of sessions) {
    // Both Vercel's cron and the GitHub Actions fallback are live and could
    // both fire this route on the same day — dedup per session_id so a
    // student never gets two "session tomorrow" pushes for the one session.
    if (session.student_id) {
      const { data: existing } = await admin
        .from('notifications')
        .select('id')
        .eq('user_id', session.student_id)
        .eq('type', 'session_reminder')
        .eq('data->>session_id', session.id)
        .limit(1)
        .maybeSingle();
      if (existing) continue;
    }

    const time = new Date(session.scheduled_at).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
    });
    const title = `Session tomorrow at ${time} — be ready.`;
    const body = session.title ?? 'CareerRai buddy session';

    // Notify student
    if (session.student_id) {
      await admin.from('notifications').insert({
        user_id: session.student_id, type: 'session_reminder',
        title, body, data: { url: '/student/tracker', session_id: session.id }, read: false, channel: 'in_app',
      });
      const { data: sp } = await admin.from('profiles').select('notif_prefs').eq('id', session.student_id).single();
      if ((sp?.notif_prefs as Record<string, unknown>)?.push === true) {
        await sendPushToUser(session.student_id, { title, body, url: '/student/tracker' });
      }
    }

    notified++;
  }

  return NextResponse.json({ notified });
}

export { POST as GET };
