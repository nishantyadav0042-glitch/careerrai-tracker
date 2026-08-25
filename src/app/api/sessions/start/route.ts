import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSessionStatus, canTransition, transitionRefusal } from '@/lib/session-lifecycle';
import { emitTimeline } from '@/lib/os/timeline';

// POST /api/sessions/start — the mentor taps "Start".
//
// THE MISSING TRANSITION. `active` has been a legal session_status since the
// table was created, and nothing has ever written it. Sixteen sessions have
// existed; nine drifted to `expired` and seven were cancelled, so the product
// has never once been able to say "this call is happening right now" — or,
// afterwards, "this call happened".
//
// Deliberately its own route rather than a branch inside the debrief: starting
// and closing out are different acts, minutes-to-an-hour apart, and a mentor
// who has begun a call should be visible immediately, not retroactively when
// they get round to writing notes.
//
// The mentor is the only actor. A student opening the meeting link does not
// mean the session began — the mentor may never arrive, and `active` would
// then be a promise the product made on a human's behalf.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const sessionId = (body as { sessionId?: unknown }).sessionId;
  if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // CHECKED READ. An unchecked read here would answer "session not found" for
  // a database blip and tell a mentor with a student waiting that their call
  // does not exist (Boundary 2).
  const { data: session, error: readError } = await admin
    .from('video_sessions')
    .select('id, buddy_id, student_id, session_status, started_at, scheduled_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (readError) {
    console.error('[sessions/start] read failed:', readError.message);
    return NextResponse.json(
      { error: 'Could not open the session — try again.' }, { status: 503 },
    );
  }
  if (!session) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if (session.buddy_id !== user.id) {
    return NextResponse.json({ error: 'This is not your session.' }, { status: 403 });
  }

  const from = session.session_status;
  if (!isSessionStatus(from)) {
    console.error('[sessions/start] unknown status in DB:', from);
    return NextResponse.json({ error: 'This session is in an unknown state.' }, { status: 500 });
  }

  // Idempotent: a second tap (or a double-submit) is a no-op success, not an
  // error and NOT a second started_at. The DB would refuse to move the
  // timestamp anyway; this answers the mentor cleanly instead of with a 500.
  if (from === 'active') {
    return NextResponse.json({ ok: true, alreadyStarted: true, startedAt: session.started_at });
  }
  if (!canTransition(from, 'active')) {
    return NextResponse.json({ error: transitionRefusal(from, 'active') }, { status: 409 });
  }

  // started_at is NOT set here — the trigger stamps it, in the same statement
  // that changes the state. One clock, and no way for a caller to backdate
  // when a call began.
  const { data: updated, error } = await admin
    .from('video_sessions')
    .update({ session_status: 'active', updated_at: new Date().toISOString() })
    // The guard makes this a conditional update: if the stale-release cron
    // expired it a moment ago, zero rows match and nothing is written.
    .eq('id', sessionId)
    .eq('session_status', from)
    .select('id, started_at')
    .maybeSingle();

  if (error) {
    console.error('[sessions/start] start failed:', error.message);
    return NextResponse.json({ error: 'Could not start the session — try again.' }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: 'This session changed while you were opening it — reload.' }, { status: 409 },
    );
  }

  // The student's story records that the call actually began. Until today this
  // moment left no trace anywhere.
  if (session.student_id) {
    await emitTimeline(admin, {
      entity: 'student', entityId: session.student_id, kind: 'session_started',
      summary: 'Session started', actor: 'buddy',
      metadata: { sessionId, buddyId: session.buddy_id },
    });
  }

  return NextResponse.json({ ok: true, startedAt: updated.started_at });
}
