import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolvePair } from '@/lib/chat';
import { serverError } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let payload: { studentId?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    // empty body is allowed (student omits studentId)
  }
  const studentId = typeof payload.studentId === 'string' ? payload.studentId : undefined;

  const admin = createAdminClient();
  const pair = await resolvePair(admin, user.id, studentId);
  if (!pair) return NextResponse.json({ error: 'Not paired' }, { status: 403 });

  // Mark all incoming (not sent by me) unread messages in this pair as read.
  const { error } = await admin
    .from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('student_id', pair.studentId)
    .eq('buddy_id', pair.buddyId)
    .neq('sender_id', user.id)
    .is('read_at', null);

  if (error) return serverError('chat-read', error);

  return NextResponse.json({ ok: true });
}
