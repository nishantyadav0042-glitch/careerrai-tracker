import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { authorizedCron } from '@/lib/cron-auth';
import { reminderNotificationBody, sessionNotificationUrl } from '@/lib/session-link';

// Runs at 06:00 UTC (11:30 AM IST) — catches sessions scheduled for tomorrow IST.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // IST CALENDAR tomorrow's [00:00, +24h) window (bug audit, 14 July) — the
  // old `[now+24h, now+48h)` rolling window was relative to whatever instant
  // the cron happened to fire (06:00 UTC = 11:30 IST), not the actual next
  // IST calendar day: a session scheduled for tomorrow before 11:30 IST fell
  // BELOW that window and got no reminder at all, while a session on the
  // day-after before 11:30 IST fell INTO it and got a wrong "tomorrow" push
  // two days early. Derive the boundary explicitly instead of drifting with
  // cron run-time.
  const IST_OFFSET_MS = 5.5 * 3_600_000;
  const nowIstMs = Date.now() + IST_OFFSET_MS;
  const istTodayMidnightMs = Math.floor(nowIstMs / 86_400_000) * 86_400_000;
  const tomorrowStart = new Date(istTodayMidnightMs + 86_400_000 - IST_OFFSET_MS);
  const tomorrowEnd = new Date(istTodayMidnightMs + 2 * 86_400_000 - IST_OFFSET_MS);

  const { data: sessions } = await admin
    .from('video_sessions')
    .select('id, student_id, buddy_id, scheduled_at, title, google_meet_link')
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
    const meetLink = (session as { google_meet_link?: string | null }).google_meet_link ?? null;
    const body = reminderNotificationBody({ istTime: time, title: session.title, meetLink });

    // BOTH sides get reminded. Only the student did, which is half a reminder
    // for a meeting that needs two people — and the mentor is the one being
    // paid to be there. Shreya's two sessions both expired with nobody joining.
    for (const [role, userId] of [
      ['student', session.student_id],
      ['buddy', session.buddy_id],
    ] as const) {
      if (!userId) continue;
      const url = sessionNotificationUrl(role);
      await admin.from('notifications').insert({
        user_id: userId, type: 'session_reminder',
        title, body, data: { url, session_id: session.id, meetLink }, read: false, channel: 'in_app',
      });
      const { data: p } = await admin.from('profiles').select('notif_prefs').eq('id', userId).single();
      if ((p?.notif_prefs as Record<string, unknown>)?.push === true) {
        await sendPushToUser(userId, { title, body, url });
      }
    }

    notified++;
  }

  return NextResponse.json({ notified });
}

export { POST as GET };
