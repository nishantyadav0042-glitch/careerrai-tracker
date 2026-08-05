import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// A student ticking off a task their mentor set.
//
// The ONLY field a student may change is whether it is done. They cannot
// create a task, edit its text, or delete it — otherwise "what my mentor asked
// me to do" becomes something the student can quietly rewrite, and the whole
// point of the checklist (evidence, not memory) goes with it.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  let body: { assignmentId?: string; done?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { assignmentId, done } = body;
  if (!assignmentId || typeof done !== 'boolean') {
    return NextResponse.json({ error: 'assignmentId and done are required.' }, { status: 400 });
  }

  const admin = createAdminClient();
  // Ownership is part of the WHERE clause, not a separate read — so there is
  // no window between checking and writing, and a guessed id touches nothing.
  const { data, error } = await admin
    .from('session_assignments')
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq('id', assignmentId)
    .eq('student_id', user.id)
    .select('id, completed_at');

  if (error) {
    console.error('[assignment] update failed:', error.message);
    return NextResponse.json({ error: "Couldn't save that — try again." }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: 'That task is not yours.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, completedAt: data[0].completed_at });
}
