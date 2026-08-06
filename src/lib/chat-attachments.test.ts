import { describe, it, expect } from 'vitest';
import {
  validateDeclaredFile, sniffMatchesMime, extensionOf, attachmentPath,
  IMAGE_MAX_BYTES, DOCUMENT_MAX_BYTES, humanSize,
} from './chat-attachments';

// Chat attachments are a MENTORING document channel, not file sharing
// (founder, 5 Aug). These tests are the allowlist: if something gets added
// here by accident, one of them should go red.

const MB = 1024 * 1024;
const ok = (name: string, mime: string, size = MB) => validateDeclaredFile(name, mime, size);

describe('what is allowed through', () => {
  it('accepts the six supported types', () => {
    expect(ok('cv.jpg', 'image/jpeg')).toMatchObject({ ok: true, kind: 'image' });
    expect(ok('cv.jpeg', 'image/jpeg')).toMatchObject({ ok: true, kind: 'image' });
    expect(ok('shot.png', 'image/png')).toMatchObject({ ok: true, kind: 'image' });
    expect(ok('shot.webp', 'image/webp')).toMatchObject({ ok: true, kind: 'image' });
    expect(ok('resume.pdf', 'application/pdf')).toMatchObject({ ok: true, kind: 'document' });
    expect(ok('sop.doc', 'application/msword')).toMatchObject({ ok: true, kind: 'document' });
    expect(ok('sop.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
      .toMatchObject({ ok: true, kind: 'document' });
  });

  it('is case-insensitive about the extension', () => {
    expect(ok('SCORECARD.PDF', 'application/pdf').ok).toBe(true);
  });

  it('accepts the spreadsheets a buddy actually sends', () => {
    // "I'm unable to attach it there on DM" — Shreya, 6 Aug, holding
    // CAT_2026_Weekly_Study_Plan_8hr_Weekdays.xlsx. A buddy's study plan IS
    // an Excel file; a chat that refuses it pushes the plan back to WhatsApp.
    expect(ok('CAT_2026_Weekly_Study_Plan_8hr_Weekdays.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
      .toMatchObject({ ok: true, kind: 'document' });
    expect(ok('plan.xls', 'application/vnd.ms-excel')).toMatchObject({ ok: true, kind: 'document' });
    expect(ok('targets.csv', 'text/csv')).toMatchObject({ ok: true, kind: 'document' });
  });

  it('accepts an allowed extension whose browser MIME is blank or generic', () => {
    // Files saved from WhatsApp on Android routinely arrive as "" or
    // application/octet-stream. The declared MIME is a hint; the byte sniff
    // after upload is the boundary the client cannot lie to.
    expect(ok('plan.xlsx', '').ok).toBe(true);
    expect(ok('plan.xlsx', 'application/octet-stream').ok).toBe(true);
    expect(ok('scorecard.pdf', 'application/octet-stream').ok).toBe(true);
  });
});

describe('what is turned away', () => {
  it('refuses video, audio, archives and executables', () => {
    const banned: [string, string][] = [
      ['lecture.mp4', 'video/mp4'],
      ['lecture.mov', 'video/quicktime'],
      ['note.mp3', 'audio/mpeg'],
      ['bundle.zip', 'application/zip'],
      ['bundle.rar', 'application/vnd.rar'],
      ['app.apk', 'application/vnd.android.package-archive'],
      ['setup.exe', 'application/x-msdownload'],
      ['script.sh', 'application/x-sh'],
    ];
    for (const [name, mime] of banned) {
      expect(validateDeclaredFile(name, mime, MB).ok, name).toBe(false);
    }
  });

  it('refuses a file with no extension at all', () => {
    expect(ok('resume', 'application/pdf').ok).toBe(false);
  });

  it('treats a dotfile as having no extension', () => {
    // ".pdf" is a hidden file named .pdf, not a PDF.
    expect(extensionOf('.pdf')).toBe('');
    expect(ok('.pdf', 'application/pdf').ok).toBe(false);
  });

  it('reads only the LAST extension, so resume.pdf.exe is an exe', () => {
    expect(extensionOf('resume.pdf.exe')).toBe('exe');
    expect(ok('resume.pdf.exe', 'application/pdf').ok).toBe(false);
  });
});

describe('the extension and the MIME type must agree', () => {
  it('refuses an executable wearing a .pdf extension', () => {
    // An AFFIRMATIVE foreign claim. Unlike a blank type, the browser here is
    // saying "this is a Windows executable" — believe it and refuse.
    const res = ok('malware.pdf', 'application/x-msdownload');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/don't match/i);
  });

  it('refuses a PDF mime on a .png name', () => {
    const res = ok('thing.png', 'application/pdf');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/don't match/i);
  });

  it('passes an empty MIME through to the byte sniff instead of refusing', () => {
    // This used to refuse — and cost a real buddy her study-plan upload,
    // because WhatsApp-saved files arrive with no type. Not knowing is not
    // lying; the post-upload sniff still rejects anything whose bytes don't
    // match the extension's type.
    expect(ok('resume.pdf', '').ok).toBe(true);
  });
});

describe('size caps', () => {
  it('allows an image right at 10 MB and refuses one byte over', () => {
    expect(validateDeclaredFile('a.png', 'image/png', IMAGE_MAX_BYTES).ok).toBe(true);
    expect(validateDeclaredFile('a.png', 'image/png', IMAGE_MAX_BYTES + 1).ok).toBe(false);
  });

  it('allows a document right at 20 MB and refuses one byte over', () => {
    expect(validateDeclaredFile('a.pdf', 'application/pdf', DOCUMENT_MAX_BYTES).ok).toBe(true);
    expect(validateDeclaredFile('a.pdf', 'application/pdf', DOCUMENT_MAX_BYTES + 1).ok).toBe(false);
  });

  it('holds images to the image cap even though documents may be larger', () => {
    expect(validateDeclaredFile('big.png', 'image/png', 15 * MB).ok).toBe(false);
    expect(validateDeclaredFile('big.pdf', 'application/pdf', 15 * MB).ok).toBe(true);
  });

  it('refuses an empty file', () => {
    expect(validateDeclaredFile('a.pdf', 'application/pdf', 0).ok).toBe(false);
  });

  it('refuses a negative or nonsense size', () => {
    expect(validateDeclaredFile('a.pdf', 'application/pdf', -1).ok).toBe(false);
    expect(validateDeclaredFile('a.pdf', 'application/pdf', NaN).ok).toBe(false);
  });

  it('says the actual limit in the error, not just "too big"', () => {
    const res = validateDeclaredFile('a.png', 'image/png', 12 * MB);
    if (!res.ok) {
      expect(res.error).toContain('10.0 MB');
      expect(res.error).toContain('12.0 MB');
    }
  });
});

describe('filenames', () => {
  it('refuses an absurdly long name', () => {
    expect(ok(`${'a'.repeat(200)}.pdf`, 'application/pdf').ok).toBe(false);
  });

  it('ignores any path a client tries to smuggle in the name', () => {
    // The stored key is generated by us, but the extension is read from this,
    // so traversal must not survive the parse.
    expect(extensionOf('../../etc/passwd.pdf')).toBe('pdf');
    expect(extensionOf('C:\\evil\\thing.png')).toBe('png');
  });
});

// ── The check the client cannot lie to ─────────────────────────────────────

const bytes = (...n: number[]) => new Uint8Array(n);
const ascii = (s: string) => new Uint8Array(Array.from(s, (c) => c.charCodeAt(0)));

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** A faithful zip local-file header: PK\x03\x04 ... nameLen@26 ... name@30. */
function zipHead(entryName: string): Uint8Array {
  const name = ascii(entryName);
  const head = new Uint8Array(30 + name.length);
  head.set([0x50, 0x4b, 0x03, 0x04]);
  head[26] = name.length & 0xff;
  head[27] = name.length >> 8;
  head.set(name, 30);
  return head;
}

describe('magic bytes must match the claimed type', () => {
  it('accepts real headers', () => {
    expect(sniffMatchesMime(bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg')).toBe(true);
    expect(sniffMatchesMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png')).toBe(true);
    expect(sniffMatchesMime(ascii('%PDF-1.7\n'), 'application/pdf')).toBe(true);
    expect(sniffMatchesMime(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), 'application/msword')).toBe(true);
  });

  it('accepts a WEBP only with both RIFF and WEBP markers', () => {
    const good = new Uint8Array(16);
    good.set(ascii('RIFF'), 0);
    good.set(ascii('WEBP'), 8);
    expect(sniffMatchesMime(good, 'image/webp')).toBe(true);

    const riffOnly = new Uint8Array(16);
    riffOnly.set(ascii('RIFF'), 0);
    riffOnly.set(ascii('AVI '), 8);   // a RIFF container that is NOT a webp
    expect(sniffMatchesMime(riffOnly, 'image/webp')).toBe(false);
  });

  it('rejects an executable renamed to .pdf — the whole point', () => {
    // MZ header: a Windows executable. Extension and MIME could both be
    // spoofed to say PDF; the bytes cannot.
    expect(sniffMatchesMime(ascii('MZ\x90\x00'), 'application/pdf')).toBe(false);
  });

  it('rejects a plain ZIP renamed to .docx', () => {
    // A .docx IS a zip, so the PK header alone would let any archive through —
    // exactly the hole this closes. The first entry name is the tell.
    const plainZip = zipHead('random-folder/file.txt');
    expect(sniffMatchesMime(plainZip, DOCX_MIME)).toBe(false);
    expect(sniffMatchesMime(zipHead('[Content_Types].xml'), DOCX_MIME)).toBe(true);
    expect(sniffMatchesMime(zipHead('word/document.xml'), DOCX_MIME)).toBe(true);
  });

  it('accepts the real buddy-sent .xlsx whose first entry is NOT [Content_Types].xml', async () => {
    // Shreya's actual file opens with xl/worksheets/sheet1.xml — the entry
    // order assumption that refused it as fake lives in version control now,
    // and this fixture makes sure it stays there.
    const { readFileSync } = await import('node:fs');
    const head = new Uint8Array(readFileSync('src/lib/__fixtures__/buddy-weekly-plan.xlsx')).slice(0, 512);
    expect(sniffMatchesMime(head, XLSX_MIME)).toBe(true);
  });

  it('rejects an .xlsx presented as .docx and vice versa — the interiors differ', () => {
    expect(sniffMatchesMime(zipHead('xl/worksheets/sheet1.xml'), DOCX_MIME)).toBe(false);
    expect(sniffMatchesMime(zipHead('word/document.xml'), XLSX_MIME)).toBe(false);
    expect(sniffMatchesMime(zipHead('xl/worksheets/sheet1.xml'), XLSX_MIME)).toBe(true);
  });

  it('rejects an empty or truncated header instead of guessing', () => {
    expect(sniffMatchesMime(new Uint8Array(0), 'application/pdf')).toBe(false);
    expect(sniffMatchesMime(bytes(0xff), 'image/jpeg')).toBe(false);
  });

  it('rejects any type outside the allowlist, whatever the bytes say', () => {
    expect(sniffMatchesMime(ascii('%PDF-'), 'application/zip')).toBe(false);
  });

  it('holds .xlsx to the same OOXML proof as .docx', () => {
    expect(sniffMatchesMime(zipHead('secret-payload/x.bin'), XLSX_MIME)).toBe(false);
    expect(sniffMatchesMime(zipHead('[Content_Types].xml'), XLSX_MIME)).toBe(true);
  });

  it('accepts a text CSV and rejects a binary renamed .csv', () => {
    expect(sniffMatchesMime(ascii('Day,Topic,Hours\nDay 1,Percentages,2'), 'text/csv')).toBe(true);
    // A NUL byte in the head means binary, whatever the name says.
    expect(sniffMatchesMime(bytes(0x4d, 0x5a, 0x90, 0x00), 'text/csv')).toBe(false);
  });
});

describe('storage keys', () => {
  it('are scoped to the pair and named by id, never by the user\'s filename', () => {
    const path = attachmentPath('stu-1', 'bud-1', 'abc-123', 'pdf');
    expect(path).toBe('stu-1/bud-1/abc-123.pdf');
    // The prefix is what the verifier re-derives to stop someone attaching
    // another conversation's file to their own message.
    expect(path.startsWith('stu-1/bud-1/')).toBe(true);
  });

  it('never contains the original filename', () => {
    const path = attachmentPath('s', 'b', 'id', 'pdf');
    expect(path).not.toMatch(/resume|\s/);
  });
});

describe('sizes read the way a person would say them', () => {
  it('formats bytes, KB and MB', () => {
    expect(humanSize(512)).toBe('512 B');
    expect(humanSize(2048)).toBe('2 KB');
    expect(humanSize(5 * MB)).toBe('5.0 MB');
  });
});

describe('the storage bucket allows everything the app allows', () => {
  // TWICE today an allowlist existed in two places and drifted: the DB body
  // check rejected caption-less attachments the API allowed, then the storage
  // bucket rejected the spreadsheets the app allowed ("that upload didn't go
  // through", founder, 23:50). A unit test cannot read the live bucket, but it
  // CAN insist that the newest bucket migration names every MIME the app
  // accepts — so adding a type here without updating the bucket fails the
  // build instead of failing a buddy.
  it('bucket migration names every allowed mime', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = 'supabase/migrations';
    const bucketMigrations = readdirSync(dir)
      .filter((f) => f.includes('chat_attachments_bucket') || f.includes('chat_attachments'))
      .sort();
    expect(bucketMigrations.length).toBeGreaterThan(0);
    const latest = readFileSync(`${dir}/${bucketMigrations[bucketMigrations.length - 1]}`, 'utf8');
    const mimes = [
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel', 'text/csv',
    ];
    for (const m of mimes) expect(latest).toContain(m);
  });
});
