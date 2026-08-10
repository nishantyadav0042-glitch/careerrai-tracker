import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolvePair } from '@/lib/chat';
import { resolveGrantAccess, MENTOR_FREE_MESSAGES } from '@/lib/mentor-doors';
import { serverError } from '@/lib/api-error';
import { pairIsBlocked, deliverPairMessage } from '@/lib/chat-deliver';
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

  // Blocks are enforced HERE, before the attachment bytes are touched, so a
  // blocked sender never gets as far as storing a file. (lib/chat-deliver)
  if (await pairIsBlocked(admin, pair)) {
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
      // attachmentGone tells the client the stored object was just deleted —
      // resending the same path can never work, so the composer must
      // RE-UPLOAD the file it is still holding. Without this flag the client
      // kept the dead path as "Ready to send" and every retry failed with
      // "that upload did not finish" (founder, 00:54, four attempts).
      return NextResponse.json({ error: verified.error, attachmentGone: true }, { status: 400 });
    }
    attachmentColumns = {
      attachment_path: verified.attachment.path,
      attachment_name: verified.attachment.name,
      attachment_mime: verified.attachment.mime,
      attachment_size: verified.attachment.size,
      attachment_kind: verified.attachment.kind,
    };
  }

  const { message, error } = await deliverPairMessage({
    admin, pair, senderId: user.id, body, attachmentColumns,
  });

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

  // The push to the other side already went out from deliverPairMessage.
  return NextResponse.json({ message });
}
