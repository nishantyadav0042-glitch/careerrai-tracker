import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendNotification } from '@/lib/notifications';
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

  let payload: { body?: unknown; studentId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (body.length < 1 || body.length > 2000) {
    return NextResponse.json({ error: 'Message must be 1–2000 characters' }, { status: 400 });
  }
  const studentId = typeof payload.studentId === 'string' ? payload.studentId : undefined;

  const admin = createAdminClient();
  const pair = await resolvePair(admin, user.id, studentId);
  if (!pair) return NextResponse.json({ error: 'Not paired' }, { status: 403 });

  const { data: message, error } = await admin
    .from('chat_messages')
    .insert({
      student_id: pair.studentId,
      buddy_id: pair.buddyId,
      sender_id: user.id,
      body,
    })
    .select('id, student_id, buddy_id, sender_id, body, created_at, read_at')
    .single();

  if (error || !message) {
    return serverError('chat-send', error);
  }

  // Best-effort notification to the recipient (the other member of the pair).
  const recipientId = user.id === pair.studentId ? pair.buddyId : pair.studentId;
  void (async () => {
    try {
      const { data: sender } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      const senderName = sender?.full_name?.split(' ')[0] ?? 'your buddy';
      const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
      // Deep-link each side to THEIR chat screen — a buddy tapping the push
      // must land on the buddy chat, not the student page.
      const recipientIsBuddy = recipientId === pair.buddyId;
      await sendNotification({
        userId: recipientId,
        type: 'chat',
        title: `${senderName} sent you a message 💬`,
        body: preview,
        channels: ['in_app', 'push'],
        data: {
          url: recipientIsBuddy ? `/buddy/chat/${pair.studentId}` : '/student/buddy?tab=chat',
          student_id: pair.studentId, buddy_id: pair.buddyId,
        },
      });
    } catch {
      // non-blocking
    }
  })();

  return NextResponse.json({ message });
}
