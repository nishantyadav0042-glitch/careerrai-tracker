import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';
import { authorizedCron } from '@/lib/cron-auth';

// Minimal 1-level escalation: student message OR mock debrief unanswered by buddy for 48h
// → notify admin. Makes the "buddy responds within 24h" promise real.
// Runs at 15:30 UTC (9 PM IST) daily.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const since48h = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const dedup24h = new Date(Date.now() - 24 * 3_600_000).toISOString();

  const { data: admins } = await admin.from('profiles').select('id, notif_prefs').eq('role', 'admin');
  if (!admins?.length) return NextResponse.json({ escalated: 0 });

  // Fetch unanswered chats and mocks concurrently
  const [{ data: unansweredChats }, { data: unansweredMocks }] = await Promise.all([
    admin
      .from('chat_messages')
      .select('id, student_id, buddy_id, sender_id, created_at, body')
      .is('read_at', null)
      .lte('created_at', since48h),
    admin
      .from('mock_debriefs')
      .select('id, student_id, taken_on, created_at')
      .lte('created_at', since48h),
  ]);

  type EscalationItem = { key: string; title: string; body: string; student_id: string; buddy_id: string };

  // PostgREST filters compare a column against a literal value, not another
  // column — `.not('sender_id', 'eq', 'buddy_id')` sent the literal string
  // "buddy_id" and Postgres rejected it as an invalid uuid. Fetch sender_id
  // alongside student_id/buddy_id instead and do the column-to-column
  // comparison here: only messages the STUDENT sent (not the buddy) count
  // as "unanswered."
  const chatsFromStudents = (unansweredChats ?? []).filter((msg) => msg.sender_id !== msg.buddy_id);

  // Process all chats and mocks concurrently — each item runs its own dedup check in parallel
  const [chatResults, mockResults] = await Promise.all([
    // 1. Chat messages from students unanswered >48h
    Promise.all(chatsFromStudents.map(async msg => {
      const [{ data: student }, { data: buddy }] = await Promise.all([
        admin.from('profiles').select('full_name').eq('id', msg.student_id).single(),
        admin.from('profiles').select('full_name').eq('id', msg.buddy_id).single(),
      ]);
      if (!student || !buddy) return null;

      const key = `chat_${msg.student_id}_${msg.buddy_id}`;
      const { data: recent } = await admin.from('notifications').select('id').eq('type', 'escalation')
        .contains('data', { key }).gte('created_at', dedup24h).limit(1);
      if (recent?.length) return null;

      return {
        key,
        title: `${student.full_name} has waited 48h+ for ${buddy.full_name} — may need you to step in.`,
        body: 'Student message unanswered for 48+ hours.',
        student_id: msg.student_id,
        buddy_id: msg.buddy_id,
      } as EscalationItem;
    })),

    // 2. Mock debriefs with no buddy feedback >48h
    Promise.all((unansweredMocks ?? []).map(async mock => {
      const { data: student } = await admin.from('profiles').select('full_name, buddy_id').eq('id', mock.student_id).single();
      if (!student?.buddy_id) return null;

      const [{ data: feedback }, { data: buddy }, { data: recent }] = await Promise.all([
        admin.from('buddy_feedback').select('id').eq('student_id', mock.student_id).gte('created_at', mock.created_at).limit(1),
        admin.from('profiles').select('full_name').eq('id', student.buddy_id).single(),
        admin.from('notifications').select('id').eq('type', 'escalation')
          .contains('data', { key: `mock_${mock.id}` }).gte('created_at', dedup24h).limit(1),
      ]);
      if (feedback?.length || recent?.length) return null;

      const key = `mock_${mock.id}`;
      return {
        key,
        title: `${student.full_name}'s mock debrief has no feedback for 48h+ from ${buddy?.full_name ?? 'buddy'} — step in?`,
        body: 'Mock submitted 48+ hours ago with no buddy feedback.',
        student_id: mock.student_id,
        buddy_id: student.buddy_id,
      } as EscalationItem;
    })),
  ]);

  const toEscalate = [...chatResults, ...mockResults].filter((r): r is EscalationItem => r !== null);
  if (!toEscalate.length) return NextResponse.json({ escalated: 0, issues: [] });

  // One dispatch() per (issue, admin) pair — was a single batch insert
  // followed by pushes with no id linking a send back to its row at all, not
  // even incidentally. Low volume (single digits/day), so trading the one
  // round-trip for a real ledger entry and cap enforcement per admin costs
  // nothing real.
  await Promise.all(
    toEscalate.flatMap(r =>
      admins.map(a => dispatch({
        userId: a.id, type: 'escalation', title: r.title, body: r.body, url: '/admin',
        data: { key: r.key, student_id: r.student_id, buddy_id: r.buddy_id },
        reason: `Unanswered ${r.key.includes('mock') ? 'mock debrief' : 'chat message'} — 48h+`,
        expectedAction: 'acknowledge',
        prefs: (a.notif_prefs as Record<string, unknown>) ?? {},
      }))
    )
  );

  return NextResponse.json({ escalated: toEscalate.length, issues: toEscalate.map(r => r.key) });
}

export { POST as GET };
