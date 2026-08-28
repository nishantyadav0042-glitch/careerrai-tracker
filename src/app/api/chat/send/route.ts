import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolvePair } from '@/lib/chat';
import { resolveChatEntitlement, consumeChatMessage, upgradeMessage } from '@/lib/chat-entitlement';
import { serverError } from '@/lib/api-error';
import { pairIsBlocked, deliverPairMessage } from '@/lib/chat-deliver';
import { verifyUploadedAttachment, discardAttachment } from '@/lib/chat-attachment-verify';
import { audit } from '@/lib/integration-audit';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

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

  // ── PAIRING and ENTITLEMENT are two questions ────────────────────────────
  //
  // They used to be one, and that was the leak. resolvePair asks only "does
  // this student hold a profiles.buddy_id?" — no plan, no premium, no
  // entitlement. The 3-message cap sat inside `if (!pair)`, so any student
  // with a buddy_id skipped it and received the continuous chat that only the
  // subscription plans buy. For the single-session product that is not an edge case:
  // pairing a session buyer with their mentor is exactly how they would get a
  // buddy_id.
  //
  // Now the cap is evaluated on EVERY send, whichever way the pair resolved.
  const entitlement = await resolveChatEntitlement(admin, user.id, studentId);
  if (entitlement.kind === 'none') {
    if (entitlement.reason === 'lookup_failed') {
      // A read we could not complete must not read as "you have no access".
      return NextResponse.json({ error: 'Could not check your access — try again.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Not paired' }, { status: 403 });
  }

  let pair = await resolvePair(admin, user.id, studentId);
  if (!pair) {
    // Not paired by profiles.buddy_id, but the entitlement names the buddy —
    // a single-session buyer or a Mentor Door student talking to their matched mentor.
    if (entitlement.kind === 'unlimited') {
      return NextResponse.json({ error: 'Not paired' }, { status: 403 });
    }
    pair = { studentId: user.id, buddyId: entitlement.buddyId };
  }

  // The student is the one spending; a mentor's reply is never metered.
  const senderIsStudent = user.id === pair.studentId;
  // Surfaced to the composer so it can show "2 left" honestly, from the
  // server's own count rather than a number the client kept.
  let remainingAfterSend: number | null = null;
  if (senderIsStudent && entitlement.kind === 'exhausted') {
    return NextResponse.json(
      {
        error: 'free_messages_used',
        upgrade: true,
        remaining: 0,
        message: upgradeMessage(entitlement.allowance),
      },
      { status: 403 }
    );
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

  // ── Spend the entitlement, atomically, BEFORE delivering ─────────────────
  //
  // One guarded UPDATE inside the database. Two tabs both reading "one left"
  // and both sending is precisely what the old count-then-compare allowed;
  // here the second caller serialises on the row lock, re-evaluates against
  // the first's committed value, and matches zero rows.
  //
  // Debited BEFORE the send so a crash between the two costs the student a
  // message rather than giving them a free one — and because the reverse
  // order is the bug: deliver, then fail to debit, forever.
  if (senderIsStudent) {
    const spend = await consumeChatMessage(admin, entitlement, pair.studentId);
    if (!spend.ok) {
      if (hasAttachment) await discardAttachment(String(att!.path));
      return NextResponse.json(
        { error: 'free_messages_used', upgrade: true, remaining: 0, message: upgradeMessage(spend.allowance) },
        { status: 403 },
      );
    }
    if (!spend.unlimited) remainingAfterSend = spend.remaining;
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
  // `remaining` comes from the SERVER's debit, never from a client counter —
  // a number the browser keeps is a number the browser can edit.
  return NextResponse.json({ message, remaining: remainingAfterSend });
}
