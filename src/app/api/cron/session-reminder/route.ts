import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { sessionNotificationUrl } from '@/lib/session-link';
import {
  sessionsDueForReminder, minutesUntil, reminderBody, REMINDER_LEAD_MS,
  type RemindableSession, type PriorReminder,
} from '@/lib/session-reminder-window';

// ── THE LAST REMINDER BEFORE THE ROOM ───────────────────────────────────────
//
// session-tomorrow tells both people the day before. This is the one that
// arrives while there is still time to act: the student is minutes from a
// mentor they paid ₹299 for, and the join link is in the message.
//
// 11 of the first 18 sessions carry status 'expired' — the state
// release-stale-sessions writes when the hour passed and nobody closed it out.
// A day-old reminder is not what gets someone into a room at 4:30pm.
//
// BOTH SIDES, deliberately. A reminder to one person is half a reminder for a
// meeting that needs two, and the mentor is the one being paid to be there.
//
// Runs every ten minutes, on an off-minute so it does not pile onto the top of
// the hour with every other scheduler on the planet. It is NOT in the GitHub
// Actions fallback: a missed 30-minute reminder is a small loss, while a
// dual-fired sub-hourly route is a standing double-send risk that would need
// its own declared defence. session-tomorrow remains the durable backstop.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/session-reminder', async () => run());
}

async function run(): Promise<NextResponse> {
  const admin = createAdminClient();
  const now = Date.now();

  // Bounded by TIME, not by population: only sessions inside the lead window
  // are ever read, so this request cannot grow with the student base.
  const { data: upcoming, error } = await admin
    .from('video_sessions')
    .select('id, student_id, buddy_id, scheduled_at, session_status, google_meet_link')
    .eq('session_status', 'scheduled')
    .gte('scheduled_at', new Date(now).toISOString())
    .lte('scheduled_at', new Date(now + REMINDER_LEAD_MS).toISOString());

  if (error) {
    console.error('[session-reminder] read failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!upcoming?.length) return NextResponse.json({ notified: 0, due: 0 });

  // What we have already said, and — crucially — what start time we said it
  // ABOUT. A session reminded for 14:00 and then moved to 16:00 must be
  // reminded again; deduping on session id alone would silently swallow it.
  const ids = upcoming.map((s) => s.id as string);
  const { data: priorRows, error: dedupErr } = await admin
    .from('notifications')
    .select('data')
    .eq('type', 'session_reminder_30m')
    .in('data->>session_id', ids);

  if (dedupErr) {
    // FAIL CLOSED. Without the dedup read we cannot tell a first reminder from
    // a repeat, and a duplicate push minutes before a session is worse than a
    // missing one — the student already has the day-before reminder.
    console.error('[session-reminder] dedup read failed, skipping run:', dedupErr.message);
    return NextResponse.json({ notified: 0, dedupUnavailable: true });
  }

  const prior: PriorReminder[] = (priorRows ?? []).map((r) => {
    const d = (r.data ?? {}) as { session_id?: string; scheduled_at?: string };
    return { sessionId: d.session_id ?? '', remindedFor: d.scheduled_at ?? null };
  });

  const due = sessionsDueForReminder(upcoming as unknown as RemindableSession[], prior, now);
  let notified = 0;

  for (const s of due) {
    const full = upcoming.find((u) => u.id === s.id)!;
    const minutes = minutesUntil(s.scheduled_at, now);
    if (minutes === null) continue;

    const meetLink = (full.google_meet_link as string | null) ?? null;
    const buddyId = full.buddy_id as string | null;
    const studentId = full.student_id as string | null;

    const [{ data: buddy }, { data: student }] = await Promise.all([
      buddyId
        ? admin.from('profiles').select('full_name, notif_prefs').eq('id', buddyId).maybeSingle()
        : Promise.resolve({ data: null }),
      studentId
        ? admin.from('profiles').select('full_name, notif_prefs').eq('id', studentId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const buddyFirst = ((buddy?.full_name as string | null) ?? 'your buddy').split(' ')[0];
    const studentFirst = ((student?.full_name as string | null) ?? 'Your student').split(' ')[0];
    const title = minutes <= 1 ? 'Your session starts now' : `Your session starts in ${minutes} minutes`;

    // scheduled_at rides in `data` because the dedup above reads it back out.
    // Without it a reschedule is indistinguishable from a repeat.
    const shared = {
      data: { session_id: s.id, scheduled_at: s.scheduled_at, meetLink },
      expectedAction: 'view_session' as const,
    };

    // `type` is written out at BOTH call sites rather than hidden in the spread
    // above. event-registry-completeness.guard.test.ts extracts dispatched
    // types statically to prove every one has a declared policy, and a type
    // reachable only through a spread is invisible to it — an event nobody can
    // audit. The duplication is the point.
    if (studentId) {
      await dispatch({
        ...shared,
        type: 'session_reminder_30m',
        userId: studentId,
        title,
        body: reminderBody({ minutes, buddyFirstName: buddyFirst, meetLink }),
        url: sessionNotificationUrl('student'),
        reason: `Session starts in ${minutes} minutes — the join link is in the message`,
        prefs: (student?.notif_prefs as Record<string, unknown>) ?? {},
      });
      notified++;
    }

    if (buddyId) {
      await dispatch({
        ...shared,
        type: 'session_reminder_30m',
        userId: buddyId,
        title,
        body: reminderBody({ minutes, buddyFirstName: studentFirst, meetLink }),
        url: sessionNotificationUrl('buddy'),
        reason: `Session with ${studentFirst} starts in ${minutes} minutes`,
        prefs: (buddy?.notif_prefs as Record<string, unknown>) ?? {},
      });
      notified++;
    }
  }

  return NextResponse.json({ notified, due: due.length, upcoming: upcoming.length });
}

export { POST as GET };
