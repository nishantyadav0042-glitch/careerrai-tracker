import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/require-admin';
import { regenerateBuddyRoom } from '@/lib/buddy-room';
import { clearGoogleState } from '@/lib/google-oauth';
import { statusFor } from '@/lib/google-meet';
import { audit } from '@/lib/integration-audit';
import { canTransition, transitionRefusal, type SessionStatus } from '@/lib/session-lifecycle';
import { settleCreditForSession } from '@/lib/session-credit';
import { dispatch } from '@/lib/notification-os';

export const dynamic = 'force-dynamic';

// Support's hands, so nobody ever opens the SQL editor to fix a session.
//
// Every fix we have needed at 10pm so far has been one of four things: a stuck
// session holding the pair lock, a mentor whose Google grant died, a permanent
// room whose calendar event someone deleted by hand, or a mentor who connected
// the wrong account. Doing any of those by hand in Postgres is how you skip
// the audit trail and learn nothing — so they live here, logged, behind the
// admin gate.

/** GET — the integration state of every buddy, plus the recent audit tail. */
export async function GET(request: NextRequest) {
  const ctx = await requireAdminCtx();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  const subject = new URL(request.url).searchParams.get('buddyId');

  const [{ data: buddies }, { data: tokens }, { data: live }, { data: log }] = await Promise.all([
    admin.from('profiles').select('id, full_name, buddy_meet_url, buddy_meet_email, buddy_meet_event_id').eq('role', 'buddy'),
    admin.from('google_oauth_tokens').select('user_id, google_email, token_expires_at'),
    admin.from('video_sessions')
      .select('id, buddy_id, student_id, title, scheduled_at, session_status')
      .in('session_status', ['scheduled', 'active'])
      .order('scheduled_at', { ascending: true }),
    (subject
      ? admin.from('integration_audit_log').select('*').eq('subject_id', subject)
      : admin.from('integration_audit_log').select('*')
    ).order('created_at', { ascending: false }).limit(100),
  ]);

  const connected = new Map((tokens ?? []).map((t) => [t.user_id, t.google_email]));
  const sessionsByBuddy = new Map<string, typeof live>();
  for (const s of live ?? []) {
    sessionsByBuddy.set(s.buddy_id, [...(sessionsByBuddy.get(s.buddy_id) ?? []), s]);
  }

  const mentors = (buddies ?? []).map((b) => {
    const tokenEmail = connected.get(b.id) ?? null;
    return {
      buddyId: b.id,
      name: b.full_name,
      googleConnected: connected.has(b.id),
      googleEmail: tokenEmail,
      hasRoom: !!b.buddy_meet_url,
      // Deliberately NOT returning buddy_meet_calendar_id or any token field.
      meetUrl: b.buddy_meet_url ?? null,
      // The state that silently breaks bookings: a room minted under an account
      // they are no longer connected with.
      roomOwnerMismatch: !!b.buddy_meet_url && !!tokenEmail && b.buddy_meet_email !== tokenEmail,
      canBook: connected.has(b.id) && !!b.buddy_meet_url,
      liveSessions: (sessionsByBuddy.get(b.id) ?? []).map((s) => ({
        id: s.id, studentId: s.student_id, title: s.title,
        scheduledAt: s.scheduled_at, status: s.session_status,
      })),
    };
  });

  return NextResponse.json({ mentors, auditTail: log ?? [] });
}

type Action = 'regenerate_room' | 'disconnect_google' | 'cancel_session';

/** POST — apply one fix. */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminCtx();
  if ('error' in ctx) return ctx.error;
  const { admin, userId: actorId } = ctx;

  let body: { action?: Action; buddyId?: string; sessionId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { action, buddyId, sessionId } = body;

  if (action === 'regenerate_room') {
    if (!buddyId) return NextResponse.json({ error: 'buddyId is required.' }, { status: 400 });
    const room = await regenerateBuddyRoom(buddyId, actorId);
    if (!room.ok) {
      return NextResponse.json({ error: room.error, reason: room.reason }, { status: statusFor(room.reason) });
    }
    await audit({ subjectId: buddyId, actorId, action: 'admin.room_regenerated', detail: { reason: body.reason ?? null } });
    return NextResponse.json({ ok: true, meetUrl: room.meetUrl });
  }

  if (action === 'disconnect_google') {
    // The only "reconnect" an admin can perform. OAuth consent is the mentor's
    // to give — nobody can click it for them — so support clears the broken
    // state and the mentor's next visit shows the Connect button again.
    if (!buddyId) return NextResponse.json({ error: 'buddyId is required.' }, { status: 400 });
    await clearGoogleState(buddyId, 'google.disconnected', { byAdmin: true, reason: body.reason ?? null }, actorId);
    return NextResponse.json({ ok: true, note: 'Cleared. The mentor must reconnect Google themselves — consent cannot be granted on their behalf.' });
  }

  if (action === 'cancel_session') {
    // Releases BOTH locks the pair holds: one-live-session and the room's time
    // slot. This is the fix for "they cannot book because a session from three
    // weeks ago is still marked scheduled".
    if (!sessionId) return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 });
    const { data: session } = await admin
      .from('video_sessions')
      .select('id, buddy_id, student_id, session_status')
      .eq('id', sessionId)
      .single();
    if (!session) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

    // Terminal is terminal (migration 20260824e). Without this guard the DB
    // trigger raises and an admin cancelling an already-finished session gets a
    // raw Postgres string in a 500 — when the honest answer is "there is no
    // lock left to release".
    const wasStatus = session.session_status as SessionStatus;
    if (!canTransition(wasStatus, 'cancelled')) {
      return NextResponse.json(
        { error: transitionRefusal(wasStatus, 'cancelled'), alreadySettled: true },
        { status: 409 },
      );
    }

    const { data: cancelledRows, error } = await admin
      .from('video_sessions')
      .update({ session_status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      // Conditional: if the session settled between our read and this write,
      // nothing is written rather than the trigger raising.
      .eq('session_status', wasStatus)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const reallyCancelled = (cancelledRows?.length ?? 0) > 0;

    // An admin cancel used to tell NOBODY. The student found out by showing
    // up to a session that was called off days earlier — the same silence the
    // buddy-side cancel was fixed for, one route over. Same event, same
    // authority, same words.
    if (reallyCancelled && session.student_id) {
      const { data: prof } = await admin
        .from('profiles').select('notif_prefs').eq('id', session.student_id).single();
      await dispatch({
        userId: session.student_id as string,
        type: 'session_cancelled',
        title: 'Session cancelled',
        body: 'Your upcoming session was cancelled. Your credit is safe — you can book again.',
        url: '/student/buddy?tab=sessions',
        data: { sessionId },
        reason: 'Admin cancelled a scheduled session — the student must never discover this by showing up',
        expectedAction: 'view_session',
        prefs: (prof?.notif_prefs as Record<string, unknown>) ?? {},
      });
      // ...and the words are true: release the credit so it can be rebooked.
      await settleCreditForSession(admin, sessionId as string, 'cancelled');
    }

    await audit({
      subjectId: session.buddy_id, actorId, action: 'admin.session_cancelled',
      detail: { sessionId, studentId: session.student_id, wasStatus: session.session_status, reason: body.reason ?? null },
    });
    return NextResponse.json({ ok: true, lockReleased: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
