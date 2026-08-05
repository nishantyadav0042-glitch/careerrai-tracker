import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// Close out a call in one request: the mentor's read of the student + the ONE
// thing the student committed to. Built to be ~15 seconds on a phone, because
// our mentors are working professionals — see the founder's note, 5 Aug.
//
// Closing a call also settles the PREVIOUS promise, so the next call always
// opens on evidence instead of memory.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { studentId, commitment, readState, sessionId, previousOutcome, dueOn } =
    (await request.json()) as {
      studentId?: string; commitment?: string;
      readState?: 'on_track' | 'struggling' | 'worried';
      sessionId?: string | null; previousOutcome?: 'kept' | 'partial' | 'missed' | null;
      dueOn?: string | null;
    };

  if (!studentId || !commitment?.trim()) {
    return NextResponse.json({ error: 'Pick or type what they committed to.' }, { status: 400 });
  }

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
  }).select('id, commitment, read_state, due_on, created_at').single();
  if (error) return NextResponse.json({ error: "Couldn't save the commitment." }, { status: 500 });

  // Mark the session done — the gap that made a 10/10 orientation invisible.
  if (sessionId) {
    await admin.from('video_sessions')
      .update({ session_status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', sessionId).eq('buddy_id', user.id);
  }

  return NextResponse.json({ ok: true, commitment: data });
}
