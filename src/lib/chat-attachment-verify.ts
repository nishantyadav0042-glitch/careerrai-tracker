import { createAdminClient } from '@/lib/supabase/admin';
import {
  validateDeclaredFile, sniffMatchesMime, SNIFF_BYTES, maxBytesFor, humanSize,
  type AttachmentKind,
} from '@/lib/chat-attachments';

// The check the client cannot lie to.
//
// Everything before this point trusted what the browser SAID: this is a PDF,
// it is 2 MB, it is called resume.pdf. Storage will happily hold whatever was
// actually sent to that URL. So before a message referencing a file is saved,
// we go and look at the object: does it exist, is it in this pair's folder, is
// it really the size it claimed, and do its first bytes match the type?
//
// An .exe renamed to .pdf with a spoofed Content-Type passes every earlier
// layer and dies here.

export interface VerifiedAttachment {
  path: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
}

export type VerifyResult =
  | { ok: true; attachment: VerifiedAttachment }
  | { ok: false; error: string };

export async function verifyUploadedAttachment(input: {
  path: string;
  filename: string;
  mime: string;
  studentId: string;
  buddyId: string;
}): Promise<VerifyResult> {
  const declared = validateDeclaredFile(input.filename, input.mime, 1);
  if (!declared.ok) return { ok: false, error: declared.error };

  // The path was minted by us as `${studentId}/${buddyId}/${uuid}.${ext}`.
  // Re-deriving the prefix rather than trusting the string is what stops a
  // caller from attaching someone else's already-uploaded file to their own
  // message by passing that file's path.
  const expectedPrefix = `${input.studentId}/${input.buddyId}/`;
  if (!input.path.startsWith(expectedPrefix) || input.path.includes('..')) {
    return { ok: false, error: 'That file does not belong to this conversation.' };
  }

  const admin = createAdminClient();
  const folder = input.path.slice(0, input.path.lastIndexOf('/'));
  const objectName = input.path.slice(input.path.lastIndexOf('/') + 1);

  const { data: listed, error: listError } = await admin.storage
    .from('chat-attachments')
    .list(folder, { search: objectName, limit: 1 });

  if (listError) {
    console.error('[attachment] list failed:', listError.message);
    return { ok: false, error: "Couldn't confirm the upload — try again." };
  }
  const object = listed?.find((o) => o.name === objectName);
  if (!object) {
    // The upload never landed, or the client is naming a file that was never
    // created. Either way there is nothing to attach.
    return { ok: false, error: 'That upload did not finish. Try sending the file again.' };
  }

  const realSize = Number(object.metadata?.size ?? 0);
  const cap = maxBytesFor(declared.kind);
  if (!realSize) return { ok: false, error: 'That file arrived empty.' };
  if (realSize > cap) {
    // The declared size passed the earlier check and the real one did not —
    // i.e. the client under-reported to get a URL.
    return {
      ok: false,
      error: `${declared.kind === 'image' ? 'Images' : 'Documents'} must be under ${humanSize(cap)}. That one is ${humanSize(realSize)}.`,
    };
  }

  // Read only the header. Downloading 20 MB to look at 512 bytes would make
  // every send slow and every send expensive.
  const { data: blob, error: dlError } = await admin.storage
    .from('chat-attachments')
    .download(input.path);
  if (dlError || !blob) {
    console.error('[attachment] header read failed:', dlError?.message);
    return { ok: false, error: "Couldn't read that file — try again." };
  }
  const head = new Uint8Array(await blob.slice(0, SNIFF_BYTES).arrayBuffer());

  if (!sniffMatchesMime(head, declared.mime)) {
    return {
      ok: false,
      error: "That file isn't really a " + declared.extension.toUpperCase() + '. Send the original file instead.',
    };
  }

  return {
    ok: true,
    attachment: {
      path: input.path,
      name: input.filename.trim().slice(0, 120),
      mime: declared.mime,
      size: realSize,
      kind: declared.kind,
    },
  };
}

/** Best-effort removal of an object nothing will ever reference. */
export async function discardAttachment(path: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.storage.from('chat-attachments').remove([path]);
  } catch (e) {
    console.error('[attachment] could not discard orphan:', path, String(e));
  }
}
