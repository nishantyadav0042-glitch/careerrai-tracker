import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { emitTimeline } from '@/lib/os/timeline';
import { dispatch } from '@/lib/notification-os';
import { settleCreditForSession } from '@/lib/session-credit';

// Close out a call in one request: the mentor's read of the student + the ONE
// thing the student committed to. Built to be ~15 seconds on a phone, because
// our mentors are working professionals — see the founder's note, 5 Aug.
//
// Closing a call also settles the PREVIOUS promise, so the next call always
// opens on evidence instead of memory.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { studentId, commitment, readState, sessionId, previousOutcome, dueOn, strength, weakness, assignments } =
    (await request.json()) as {
      studentId?: string; commitment?: string;
      readState?: 'on_track' | 'struggling' | 'worried';
      sessionId?: string | null; previousOutcome?: 'kept' | 'partial' | 'missed' | null;
      dueOn?: string | null;
      strength?: string; weakness?: string;
      assignments?: string[];
    };

  if (!studentId || !commitment?.trim()) {
    return NextResponse.json({ error: 'Pick or type what they committed to.' }, { status: 400 });
  }
  // Feedback is now part of closing a call, not an optional extra (founder,
  // 5 Aug). One line each — the student reads these verbatim.
  if (!strength?.trim() || !weakness?.trim()) {
    return NextResponse.json({ error: 'Add one strength and one thing to fix — your student sees both.' }, { status: 400 });
  }

  // Up to four tasks. More than that is a to-do list nobody starts.
  const tasks = (assignments ?? [])
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter(Boolean)
    .slice(0, 4)
    .map((t) => t.slice(0, 200));

  const admin = createAdminClient();
  const { data: student } = await admin
    .from('profiles').select('buddy_id').eq('id', studentId).maybeSingle();
  if (!student || student.buddy_id !== user.id) {
    return NextResponse.json({ error: 'Not your student' }, { status: 403 });
  }

  // Settle the open promise first — the unique index allows only one open at a
  // time, so this must happen before the insert or the insert will collide.
  const { error: settleError } = await admin
    .from('session_commitments')
    .update({ outcome: previousOutcome ?? 'partial', reviewed_at: new Date().toISOString() })
    .eq('buddy_id', user.id).eq('student_id', studentId).is('outcome', null);
  if (settleError) {
    return NextResponse.json({ error: "Couldn't close the previous commitment." }, { status: 500 });
  }

  const { data, error } = await admin.from('session_commitments').insert({
    buddy_id: user.id,
    student_id: studentId,
    session_id: sessionId ?? null,
    commitment: commitment.trim().slice(0, 300),
    read_state: readState ?? 'on_track',
    due_on: dueOn ?? null,
    strength: strength.trim().slice(0, 300),
    weakness: weakness.trim().slice(0, 300),
  }).select('id, commitment, read_state, due_on, created_at').single();
  if (error) return NextResponse.json({ error: "Couldn't save the commitment." }, { status: 500 });

  // The tasks that back the promise. Written after the commitment so a failed
  // insert here can never leave assignments pointing at a call that was never
  // closed out.
  if (tasks.length) {
    const { error: taskError } = await admin.from('session_assignments').insert(
      tasks.map((task, i) => ({
        buddy_id: user.id,
        student_id: studentId,
        session_id: sessionId ?? null,
        task,
        position: i,
      })),
    );
    // Reported, not fatal: the call IS closed and the promise IS saved. Losing
    // the checklist is worse than losing nothing, but far worse would be
    // telling a mentor their close-out failed after it succeeded.
    if (taskError) console.error('[commitment] assignments insert failed:', taskError.message);
  }

  // Tell the student there is something waiting — a debrief nobody reads is
  // the same as no debrief.

  // Mark the session done — the gap that made a 10/10 orientation invisible.
  //
  // 24 Aug: ended_at is no longer set here. The DB trigger stamps it in the
  // same statement that changes the state, so the close-out cannot record a
  // time that disagrees with the transition — and a second debrief for the
  // same session can no longer quietly move it.
  //
  // The status guard makes this a conditional update: a session already
  // completed, cancelled or expired matches zero rows and writes nothing,
  // rather than the trigger raising an error into a result nobody read.
  let sessionCompleted = false;
  if (sessionId) {
    const { data: done, error: doneError } = await admin.from('video_sessions')
      .update({ session_status: 'completed' })
      .eq('id', sessionId).eq('buddy_id', user.id)
      .in('session_status', ['scheduled', 'active'])
      .select('id, student_id')
      .maybeSingle();

    if (doneError) {
      // Reported, never fatal: the debrief itself IS saved. But a silent
      // failure here is precisely how "0 completed sessions" happened.
      console.error('[commitment] session completion failed:', doneError.message);
    } else if (done) {
      sessionCompleted = true;
      await emitTimeline(admin, {
        entity: 'student', entityId: done.student_id as string, kind: 'session_completed',
        summary: 'Session completed', actor: 'buddy',
        metadata: { sessionId, buddyId: user.id },
      });
    }
  }

  // The debrief announces a call that happened, so it may only be sent by a
  // caller that actually closed one — or where there was no session row to
  // close (notes saved against a call tracked outside video_sessions).
  //
  // It used to fire BEFORE this update and unconditionally: when a cancel won
  // the race, the student was told "your buddy left notes from the call"
  // about a session that never happened, sitting next to "Session cancelled".
  // A notification may only describe a transition its own caller won.
  if (sessionCompleted || !sessionId) {
    const { data: debriefStudent } = await admin
      .from('profiles').select('notif_prefs').eq('id', studentId).single();
    await dispatch({
      userId: studentId,
      type: 'session_debrief',
      title: 'Your buddy left notes from the call',
      body: tasks.length
        ? `${tasks.length} thing${tasks.length > 1 ? 's' : ''} to do before next time.`
        : 'Open your Buddy tab to see what went well and what to fix.',
      url: '/student/buddy',
      data: { sessionId: sessionId ?? null },
      reason: 'Buddy closed out the call and left notes the student has not seen',
      expectedAction: 'open_buddy',
      prefs: (debriefStudent?.notif_prefs as Record<string, unknown>) ?? {},
    });
  }

  // The ₹299 this session delivered is now spent. Without this the credit sat
  // at 'scheduled' forever, blocking the student from ever buying a second
  // session and permanently consuming a seat of their mentor's capacity.
  if (sessionCompleted && sessionId) {
    await settleCreditForSession(admin, sessionId, 'completed');
  }

  return NextResponse.json({ ok: true, commitment: data, sessionCompleted });
}
