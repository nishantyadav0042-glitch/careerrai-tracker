import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendNotification } from '@/lib/notifications';
import { resolvePair } from '@/lib/chat';
import { resolveGrantAccess, MENTOR_FREE_MESSAGES } from '@/lib/mentor-doors';
import { serverError } from '@/lib/api-error';
import { isBlockedPair } from '@/lib/chat-safety';
import { verifyUploadedAttachment, discardAttachment } from '@/lib/chat-attachment-verify';
import { audit } from '@/lib/integration-audit';

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let payload: {
    body?: unknown; studentId?: unknown;
    attachment?: { path?: unknown; filename?: unknown; mime?: unknown };
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const att = payload.attachment;
  const hasAttachment = !!att && typeof att.path === 'string' && typeof att.filename === 'string';

  // A message may be text, or a file, or both — but not nothing. Sending a
  // resume with no covering note is a completely normal thing to do.
  if (!hasAttachment && (body.length < 1 || body.length > 2000)) {
    return NextResponse.json({ error: 'Message must be 1–2000 characters' }, { status: 400 });
  }
  if (body.length > 2000) {
    return NextResponse.json({ error: 'Message must be under 2000 characters' }, { status: 400 });
  }
  const studentId = typeof payload.studentId === 'string' ? payload.studentId : undefined;

  const admin = createAdminClient();
  let pair = await resolvePair(admin, user.id, studentId);
  // Mentor Doors: a free student with an ACTIVE grant (or their granted buddy)
  // chats through the same pipe — capped at 3 student messages, ever, to one
  // buddy. The 4th attempt returns the upgrade ask instead of a send.
  if (!pair) {
    const grantAccess = await resolveGrantAccess(admin, user.id, studentId);
    if (!grantAccess) return NextResponse.json({ error: 'Not paired' }, { status: 403 });
    if (user.id === grantAccess.studentId && grantAccess.remaining <= 0) {
      return NextResponse.json(
        {
          error: 'free_messages_used',
          upgrade: true,
          message: `You've used all ${MENTOR_FREE_MESSAGES} free questions. Upgrade to keep talking to your buddy — unlimited chat, weekly 1-on-1s, every mock decoded.`,
        },
        { status: 403 }
      );
    }
    pair = { studentId: grantAccess.studentId, buddyId: grantAccess.buddyId };
  }

  // A block stops messages in BOTH directions (App Store 1.2 / Play UGC). A
  // block that only silences the person who filed it is not a block — the
  // abusive party would keep talking, which is the exact thing the guideline
  // exists to prevent. Enforced HERE, on the server: a UI-only block is a
  // gesture, not a protection.
  const { data: blockRows } = await admin
    .from('chat_blocks')
    .select('blocker_id, blocked_id')
    .in('blocker_id', [pair.studentId, pair.buddyId])
    .in('blocked_id', [pair.studentId, pair.buddyId]);
  if (isBlockedPair(blockRows, pair.studentId, pair.buddyId)) {
    return NextResponse.json(
      { error: 'blocked', message: 'This conversation is blocked. Email business@careerrai.com if you need it reopened.' },
      { status: 403 }
    );
  }

  // Now go and look at the bytes. Everything up to here believed the client.
  let attachmentColumns = {};
  if (hasAttachment) {
    const verified = await verifyUploadedAttachment({
      path: String(att!.path),
      filename: String(att!.filename),
      mime: typeof att!.mime === 'string' ? att!.mime : '',
      studentId: pair.studentId,
      buddyId: pair.buddyId,
    });
    if (!verified.ok) {
      // The object is unreferenced and always will be — take it back out
      // rather than leaving it to be paid for forever.
      await discardAttachment(String(att!.path));
      await admin.from('attachment_uploads').delete().eq('path', String(att!.path));
      await audit({
        subjectId: user.id, action: 'chat.attachment_rejected', ok: false,
        detail: { reason: verified.error, stage: 'verify' },
      });
      return NextResponse.json({ error: verified.error }, { status: 400 });
    }
    attachmentColumns = {
      attachment_path: verified.attachment.path,
      attachment_name: verified.attachment.name,
      attachment_mime: verified.attachment.mime,
      attachment_size: verified.attachment.size,
      attachment_kind: verified.attachment.kind,
    };
  }

  const { data: message, error } = await admin
    .from('chat_messages')
    .insert({
      student_id: pair.studentId,
      buddy_id: pair.buddyId,
      sender_id: user.id,
      body,
      ...attachmentColumns,
    })
    .select('id, student_id, buddy_id, sender_id, body, created_at, read_at, attachment_name, attachment_mime, attachment_size, attachment_kind')
    .single();

  if (error || !message) {
    // No message row means nothing will ever point at the file.
    if (hasAttachment) await discardAttachment(String(att!.path));
    return serverError('chat-send', error);
  }

  if (hasAttachment) {
    // Claimed: a message now references this object, so cleanup must leave it
    // alone forever.
    await admin
      .from('attachment_uploads')
      .update({ claimed_at: new Date().toISOString() })
      .eq('path', String(att!.path));
    await audit({
      subjectId: user.id, action: 'chat.attachment_uploaded',
      detail: {
        messageId: message.id, kind: message.attachment_kind,
        mime: message.attachment_mime, size: message.attachment_size,
      },
    });
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
      const preview = body.length > 80 ? `${body.slice(0, 80)}…` : (body || (hasAttachment ? '📎 Sent you a file' : ''));
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
