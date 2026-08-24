import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateFeedback } from '@/lib/session-feedback';

// POST /api/sessions/feedback — the student rates a completed session.
//
// The student is the only one who may write this. A mentor rating their own
// session would make every quality number self-reported, which is the same
// mistake the intervention ledger exists to avoid.
//
// Eligibility is checked here for a readable message AND enforced by a trigger
// (migration 20260824j): only a `completed` session is rateable, and the
// feedback must belong to the two people who were in the room.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const sessionId = (body as { videoSessionId?: unknown }).videoSessionId;
  if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return NextResponse.json({ error: 'Which session?' }, { status: 400 });
  }

  const valid = validateFeedback(body as Record<string, unknown>);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  const admin = createAdminClient();

  // CHECKED read. A blip must not tell a student their session does not exist.
  const { data: session, error: readError } = await admin
    .from('video_sessions')
    .select('id, student_id, buddy_id, session_status')
    .eq('id', sessionId)
    .maybeSingle();

  if (readError) {
    console.error('[sessions/feedback] read failed:', readError.message);
    return NextResponse.json({ error: 'Could not open that session — try again.' }, { status: 503 });
  }
  if (!session) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

  // Only the student who was in the room. Not the mentor, not anyone else.
  if (session.student_id !== user.id) {
    return NextResponse.json({ error: 'This is not your session.' }, { status: 403 });
  }
  if (session.session_status !== 'completed') {
    return NextResponse.json(
      { error: 'You can rate a session once it has finished.', status: session.session_status },
      { status: 409 },
    );
  }

  // The intent is carried onto the feedback so a report can ask "which reasons
  // end up resolved?" without joining back through the payment.
  const { data: credit } = await admin
    .from('session_credits')
    .select('session_intent')
    .eq('video_session_id', sessionId)
    .maybeSingle();

  const { error } = await admin.from('session_feedback').insert({
    video_session_id: sessionId,
    student_id: session.student_id,
    buddy_id: session.buddy_id,
    rating: valid.value.rating,
    issue_resolved: valid.value.issueResolved,
    would_book_again: valid.value.wouldBookAgain,
    what_helped: valid.value.whatHelped,
    what_was_missing: valid.value.whatWasMissing,
    session_intent: (credit?.session_intent as string | null) ?? null,
  });

  if (error) {
    // 23505 = already rated. A second submission is not an error worth
    // alarming a student with — their view simply already had an answer.
    if (error.code === '23505') {
      return NextResponse.json({ ok: true, alreadySubmitted: true });
    }
    console.error('[sessions/feedback] insert failed:', error.message);
    return NextResponse.json({ error: 'Could not save your feedback — try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
