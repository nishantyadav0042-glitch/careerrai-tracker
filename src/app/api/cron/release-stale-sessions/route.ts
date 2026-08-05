import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { audit } from '@/lib/integration-audit';

export const dynamic = 'force-dynamic';

// Releases the booking lock from sessions nobody ever closed out.
//
// A pair may hold exactly ONE live session. That rule is what stops the
// four-rooms-in-one-evening failure — and it has a sharp edge: a session
// left `scheduled` holds the lock FOREVER. This database already had one from
// 21 July still marked live, which under the new rule silently blocks that
// pair from ever booking again. Nobody would have reported it as "the lock is
// stuck"; they would have reported "booking is broken".
//
// So: once a session's own window has been over for STALE_AFTER_HOURS and no
// one has marked it completed or cancelled, we release it.
//
// It is marked `expired` — not `completed`, and deliberately not `cancelled`.
// Both of those make a claim we cannot support:
//
//   'completed' asserts the call happened. That is fabricated evidence, the
//               thing Incident #9's exam_ready guard exists to prevent.
//   'cancelled' asserts it did NOT happen. Writing this cron against live data
//               showed it would have marked the 4 Aug Shreya orientation
//               cancelled — a session the founder watched go well and rated
//               10/10. A cleanup job must not rewrite history it did not see.
//
// 'expired' says only what is true: the window passed, nobody recorded an
// outcome, and it no longer blocks anyone. A mentor can still mark it completed
// afterwards.

/** Long enough that a call running over, or a late close-out, is never touched. */
const STALE_AFTER_HOURS = 6;

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const now = Date.now();

  // Candidates: still live, and scheduled long enough ago that even a 60-minute
  // session plus the grace window is comfortably past.
  const cutoff = new Date(now - STALE_AFTER_HOURS * 3_600_000).toISOString();

  const { data: candidates, error } = await admin
    .from('video_sessions')
    .select('id, buddy_id, student_id, title, scheduled_at, duration_minutes, session_status')
    .in('session_status', ['scheduled', 'active'])
    .lt('scheduled_at', cutoff)
    .order('scheduled_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[release-stale-sessions]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Second filter in code, against each session's OWN end time — a 60-minute
  // session starting 6h ago is stale, but the cutoff above is a coarse index
  // scan and this is the precise question.
  const stale = (candidates ?? []).filter((s) => {
    const end = Date.parse(s.scheduled_at) + (s.duration_minutes ?? 30) * 60_000;
    return now - end > STALE_AFTER_HOURS * 3_600_000;
  });

  const released: string[] = [];
  for (const s of stale) {
    const { error: e } = await admin
      .from('video_sessions')
      .update({ session_status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', s.id)
      // Guard against releasing a session someone closed out in the meantime.
      .in('session_status', ['scheduled', 'active']);
    if (e) { console.error('[release-stale-sessions] release failed', s.id, e.message); continue; }

    released.push(s.id);
    await audit({
      subjectId: s.buddy_id,
      actorId: null, // the system did this, not the mentor
      action: 'booking.expired',
      detail: {
        sessionId: s.id, studentId: s.student_id,
        scheduledAt: s.scheduled_at, wasStatus: s.session_status,
        autoReleased: true, staleAfterHours: STALE_AFTER_HOURS,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    examined: candidates?.length ?? 0,
    released: released.length,
    sessionIds: released,
  });
}

export { POST as GET };
