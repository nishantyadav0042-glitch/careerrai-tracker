import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendNotification } from '@/lib/notifications';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { recipientId, body } = await req.json();
  if (!recipientId || !body?.trim()) {
    return NextResponse.json({ error: 'recipientId and body required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify this is a valid buddy<->student pair
  const { data: pair } = await admin
    .from('profiles')
    .select('id, buddy_id')
    .eq('id', recipientId)
    .single();

  const isStudentMessagingBuddy = pair?.buddy_id === user.id;
  const isValid = isStudentMessagingBuddy || pair?.id === recipientId;
  if (!isValid) {
    return NextResponse.json({ error: 'Not authorized to message this user' }, { status: 403 });
  }

  // Insert the message
  const { data: message, error } = await admin
    .from('chat_messages')
    .insert({
      sender_id: user.id,
      recipient_id: recipientId,
      body: body.trim(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Send notification async (non-blocking)
  (() => {
    try {
      const pairData = {
        studentId: isStudentMessagingBuddy ? user.id : recipientId,
        buddyId: isStudentMessagingBuddy ? recipientId : user.id,
      };

      // Get sender name
      admin
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()
        .then(({ data: sender }) => {
          const senderName = sender?.full_name?.split(' ')[0] ?? 'your buddy';
          const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
          sendNotification({
            userId: recipientId,
            type: 'chat',
            title: `${senderName} sent you a message.`,
            body: preview,
            channels: ['in_app', 'push'],
            data: { url: '/student/buddy', student_id: pairData.studentId, buddy_id: pairData.buddyId },
          });
        });
    } catch {
      // non-blocking
    }
  })();

  return NextResponse.json({ message });
}
