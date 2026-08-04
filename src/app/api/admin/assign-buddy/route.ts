import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/audit';
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

    // Tell BOTH sides. The first real assignment (4 Aug) notified nobody:
    // the student's "buddy unlocked" fired at payment time, but the buddy
    // learned they had a paying mentee only because the founder messaged
    // them — a paid match that depends on a WhatsApp side-channel isn't a
    // product. Fire-and-forget: notify failures never fail the assignment.
    void (async () => {
      const [{ data: student }, { data: buddy }] = await Promise.all([
        admin.from('profiles').select('full_name, target_percentile').eq('id', student_id).single(),
        admin.from('profiles').select('full_name').eq('id', buddy_id).single(),
      ]);
      const studentName = student?.full_name ?? 'A new student';
      await admin.from('notifications').insert([
        {
          user_id: buddy_id, type: 'buddy_assigned',
          title: `🎓 New mentee: ${studentName}`,
          body: `${studentName}${student?.target_percentile ? ` (targeting ${student.target_percentile}%ile)` : ''} just upgraded and is assigned to you. Say hello today — the first message sets the tone.`,
          data: { url: `/buddy/chat?student=${student_id}` }, read: false, channel: 'in_app',
        },
        {
          user_id: student_id, type: 'buddy_assigned',
          title: `🤝 Meet ${buddy?.full_name ?? 'your buddy'}`,
          body: `${buddy?.full_name ?? 'Your IIM senior'} is now your buddy. They'll message you here — say hi back.`,
          data: { url: '/student/buddy' }, read: false, channel: 'in_app',
        },
      ]);
      const { sendPushToUser } = await import('@/lib/push');
      await sendPushToUser(buddy_id, {
        title: `🎓 New mentee: ${studentName}`,
        body: 'They just upgraded. Say hello today.',
        url: `/buddy/chat?student=${student_id}`,
      });
      await sendPushToUser(student_id, {
        title: `🤝 Meet ${buddy?.full_name ?? 'your buddy'}`,
        body: 'Your buddy is ready — open the app to say hi.',
        url: '/student/buddy',
      });
    })().catch((e) => console.error('[assign-buddy] notify failed', e));
  }

  logAdminAction(user.id, 'assign_buddy', 'student', student_id, { buddy_id: buddy_id || null });

  return NextResponse.json({ ok: true, student_id, buddy_id });
}
