import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';
import { authorizedCron } from '@/lib/cron-auth';
import { reminderNotificationBody, sessionNotificationUrl } from '@/lib/session-link';
import { withCronTracking } from '@/lib/cron-run-tracker';

// Runs at 06:00 UTC (11:30 AM IST) — catches sessions scheduled for tomorrow IST.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/session-tomorrow', async () => sessionTomorrowRun());
}

async function sessionTomorrowRun(): Promise<NextResponse> {
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
  let dedupUnavailable = 0;
  for (const session of sessions) {
    // Both Vercel's cron and the GitHub Actions fallback are live and could
    // both fire this route on the same day — dedup per session_id so nobody
    // gets two "session tomorrow" pushes for the one session.
    //
    // Read PER RECIPIENT, not per session. The old check looked only at
    // session.student_id and then the loop below reminded the student AND the
    // buddy, so the mentor's reminder had no dedup at all: on any day both
    // schedulers fired, every buddy was reminded twice. It also skipped the
    // check entirely when student_id was null, which reminded the buddy twice
    // for exactly the sessions nobody was checking.
    //
    // session_reminder is NOT in notifications_once_per_day_per_type, so this
    // read is the only protection that exists — which is why it must also
    // fail CLOSED: an unreadable answer means we cannot prove this session was
    // not already reminded, and a second reminder is worse than a late one.
    const recipients = ([
      ['student', session.student_id],
      ['buddy', session.buddy_id],
    ] as const).filter((r): r is readonly ['student' | 'buddy', string] => Boolean(r[1]));

    const alreadyReminded = new Set<string>();
    let dedupFailed = false;
    for (const [, userId] of recipients) {
      const { data: existing, error } = await admin
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'session_reminder')
        .eq('data->>session_id', session.id)
        .limit(1)
        .maybeSingle();
      if (error) { dedupFailed = true; break; }
      if (existing) alreadyReminded.add(userId);
    }
    if (dedupFailed) { dedupUnavailable++; continue; }
    if (alreadyReminded.size === recipients.length) continue;

    const time = new Date(session.scheduled_at).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
    });
    const title = `Session tomorrow at ${time} — be ready.`;
    const meetLink = (session as { google_meet_link?: string | null }).google_meet_link ?? null;
    const body = reminderNotificationBody({ istTime: time, title: session.title, meetLink });

    // BOTH sides get reminded. Only the student did, which is half a reminder
    // for a meeting that needs two people — and the mentor is the one being
    // paid to be there. Shreya's two sessions both expired with nobody joining.
    for (const [role, userId] of recipients) {
      if (alreadyReminded.has(userId)) continue; // this side already has it
      const url = sessionNotificationUrl(role);
      const { data: p } = await admin.from('profiles').select('notif_prefs').eq('id', userId).single();
      await dispatch({
        userId, type: 'session_reminder', title, body, url,
        data: { session_id: session.id, meetLink },
        reason: `1:1 session at ${time} tomorrow, IST`, expectedAction: 'view_session',
        prefs: (p?.notif_prefs as Record<string, unknown>) ?? {},
      });
    }

    notified++;
  }

  return NextResponse.json({ notified, dedupUnavailable });
}

export { POST as GET };
