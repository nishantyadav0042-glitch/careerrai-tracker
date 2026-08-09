import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/audit';
import { emitTimeline } from '@/lib/os/timeline';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { student_id, buddy_id } = await request.json();
  if (!student_id) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 });

  // Validate buddy exists and is actually a buddy
  if (buddy_id) {
    const { data: buddy } = await admin.from('profiles').select('role').eq('id', buddy_id).single();
    if (!buddy || buddy.role !== 'buddy') {
      return NextResponse.json({ error: 'Invalid buddy' }, { status: 400 });
    }
  }

  // Update student's buddy assignment
  const { error } = await admin
    .from('profiles')
    .update({ buddy_id: buddy_id || null })
    .eq('id', student_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Freemium: drain this student out of the buddy assignment queue.
  if (buddy_id) {
    await admin
      .from('buddy_assignment_queue')
      .update({ status: 'assigned', assigned_buddy_id: buddy_id, assigned_at: new Date().toISOString() })
      .eq('student_id', student_id)
      .eq('status', 'pending');
  }

  logAdminAction(user.id, 'assign_buddy', 'student', student_id, { buddy_id: buddy_id || null });

  // Timeline: a mentor assignment (or removal) is a decision worth replaying.
  await emitTimeline(admin, {
    entity: 'student', entityId: student_id,
    kind: buddy_id ? 'buddy_assigned' : 'buddy_unassigned',
    summary: buddy_id ? 'Mentor assigned' : 'Mentor removed',
    actor: 'admin', metadata: { buddy_id: buddy_id || null },
  });

  return NextResponse.json({ ok: true, student_id, buddy_id });
}
