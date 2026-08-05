import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// Private mentor notes. Guarded twice: the caller must be a buddy, AND the
// student must be assigned to THEM — a mentor can never read or write notes
// about someone else's student.
async function guard(studentId: string) {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: student } = await admin
    .from('profiles').select('buddy_id').eq('id', studentId).maybeSingle();
  if (!student || student.buddy_id !== user.id) {
    return { error: NextResponse.json({ error: 'Not your student' }, { status: 403 }) };
  }
  return { user, admin };
}

export async function POST(request: NextRequest) {
  const { studentId, body } = (await request.json()) as { studentId?: string; body?: string };
  if (!studentId || !body?.trim()) {
    return NextResponse.json({ error: 'Write something first.' }, { status: 400 });
  }
  const g = await guard(studentId);
  if ('error' in g) return g.error;

  const { data, error } = await g.admin.from('buddy_notes')
    .insert({ buddy_id: g.user.id, student_id: studentId, body: body.trim().slice(0, 2000) })
    .select('id, body, created_at').single();
  if (error) return NextResponse.json({ error: "Couldn't save the note." }, { status: 500 });
  return NextResponse.json({ ok: true, note: data });
}
