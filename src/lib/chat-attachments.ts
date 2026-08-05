// What may be attached to a chat message, and how we prove it.
//
// This is a MENTORING document channel, not file sharing (founder, 5 Aug):
// images and documents only, one per message, hard caps. No video, audio,
// archives or executables — those are the formats that turn a chat into a
// storage bill and a malware vector, and none of them help a student get a
// resume reviewed.
//
// Three independent checks, because any one alone is bypassable:
//   1. extension  — what the file claims to be
//   2. MIME type  — what the browser claims it is
//   3. magic bytes — what it actually is, read server-side after upload
// A mismatch between any two is a rejection. The client's word is never the
// last word on any of them.

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;    // 10 MB
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export type AttachmentKind = 'image' | 'document';

interface AllowedType {
  mime: string;
  extensions: string[];
  kind: AttachmentKind;
}

const ALLOWED: AllowedType[] = [
  { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], kind: 'image' },
  { mime: 'image/png', extensions: ['png'], kind: 'image' },
  { mime: 'image/webp', extensions: ['webp'], kind: 'image' },
  { mime: 'application/pdf', extensions: ['pdf'], kind: 'document' },
  { mime: 'application/msword', extensions: ['doc'], kind: 'document' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    kind: 'document',
  },
];

/** The accept="" value for the file input — a convenience, never a control. */
export const ACCEPT_ATTRIBUTE = ALLOWED
  .flatMap((t) => [t.mime, ...t.extensions.map((e) => `.${e}`)])
  .join(',');

export const MAX_FILENAME_LENGTH = 120;

export function maxBytesFor(kind: AttachmentKind): number {
  return kind === 'image' ? IMAGE_MAX_BYTES : DOCUMENT_MAX_BYTES;
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  // A leading dot is a hidden file, not an extension: ".pdf" has no name.
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export type Validation =
  | { ok: true; kind: AttachmentKind; mime: string; extension: string }
  | { ok: false; error: string };

/**
 * Check what the client CLAIMS, before we hand out an upload URL.
 *
 * Cheap and early: rejecting a 200 MB video here costs one request instead of
 * a 200 MB transfer. It is not a security boundary on its own — the bytes are
 * re-checked after upload — but it is the difference between a good error
 * message and a mysterious failure two minutes in.
 */
export function validateDeclaredFile(
  filename: string, mime: string, size: number,
): Validation {
  const name = (filename ?? '').trim();
  if (!name) return { ok: false, error: 'That file has no name.' };
  if (name.length > MAX_FILENAME_LENGTH) {
    return { ok: false, error: `File names must be under ${MAX_FILENAME_LENGTH} characters.` };
  }

  const extension = extensionOf(name);
  if (!extension) return { ok: false, error: 'That file has no extension, so we cannot tell what it is.' };

  const byMime = ALLOWED.find((t) => t.mime === mime);
  const byExt = ALLOWED.find((t) => t.extensions.includes(extension));

  if (!byExt) {
    return {
      ok: false,
      error: `.${extension} files aren't supported. You can send images (JPG, PNG, WEBP) and documents (PDF, DOC, DOCX).`,
    };
  }
  if (!byMime) {
    return { ok: false, error: 'That file type is not supported here.' };
  }
  // The classic upload attack: resume.pdf.exe, or an executable renamed .pdf.
  // If the two disagree, at least one of them is lying.
  if (byMime.mime !== byExt.mime) {
    return { ok: false, error: "That file's type and its extension don't match, so we can't accept it." };
  }

  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: 'That file looks empty.' };
  }
  const cap = maxBytesFor(byExt.kind);
  if (size > cap) {
    return {
      ok: false,
      error: `${byExt.kind === 'image' ? 'Images' : 'Documents'} must be under ${humanSize(cap)}. That one is ${humanSize(size)}.`,
    };
  }

  return { ok: true, kind: byExt.kind, mime: byExt.mime, extension };
}

// ── What the bytes actually are ────────────────────────────────────────────

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

const ASCII = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/**
 * Confirm the stored object really is what it claimed, from its header.
 *
 * This is the check the client cannot lie to, because it runs on the bytes we
 * actually received. An .exe renamed to .pdf with a spoofed Content-Type gets
 * past every other layer and dies here.
 */
export function sniffMatchesMime(head: Uint8Array, mime: string): boolean {
  switch (mime) {
    case 'image/jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      // "RIFF" .... "WEBP"
      return startsWith(head, ASCII('RIFF')) && startsWith(head, ASCII('WEBP'), 8);
    case 'application/pdf':
      return startsWith(head, ASCII('%PDF-'));
    case 'application/msword':
      // OLE2 compound document.
      return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      // .docx is a ZIP, so the ZIP header alone would also accept any archive
      // renamed .docx — which is exactly the hole we are trying to close.
      // Every OOXML file's FIRST entry is [Content_Types].xml, so require that
      // name in the first local file header too.
      if (!startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return false;
      const text = new TextDecoder('latin1').decode(head.slice(0, 512));
      return text.includes('[Content_Types].xml');
    }
    default:
      return false;
  }
}

/** How many bytes we need to read to make the call above. */
export const SNIFF_BYTES = 512;

/**
 * The object key. Random, not derived from the filename.
 *
 * Two reasons: a user-supplied name in a path is a traversal bug waiting to
 * happen, and a predictable key would leak what someone sent (`ravi-resume
 * -final.pdf`) to anyone who could guess paths. The real name is kept in the
 * database and shown in the UI.
 */
export function attachmentPath(
  studentId: string, buddyId: string, id: string, extension: string,
): string {
  return `${studentId}/${buddyId}/${id}.${extension}`;
}
