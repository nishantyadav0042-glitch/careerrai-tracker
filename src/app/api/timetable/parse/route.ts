import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { callGemini, extractJson, type GeminiPart } from '@/lib/gemini';
import { sanitizeBlocks, sanitizeSyllabusEndDate, sanitizeTargets } from '@/lib/timetable';
import { EXTRACT_PROMPT, spreadsheetPrompt, salvageTruncatedJson } from '@/lib/timetable-extract';
import { workbookToSheets, csvToSheet, sheetsToPromptText, windowDatedSheets, type SheetText } from '@/lib/workbook-text';

export const maxDuration = 60;

// Coaching timetable -> structured blocks.
//
// Two ways in, one extractor, one sanitizer:
//   · photo / PDF — Gemini reads the pixels directly (same path as scorecards)
//   · Excel / CSV — the workbook is unpacked server-side (lib/workbook-text)
//     and every sheet's grid goes to the SAME prompt as labeled text. Founder,
//     6 Aug: "students will send excel files only mostly" — a workbook with a
//     daily sheet AND a weekly sheet comes back as one merged plan.
//
// This route EXTRACTS ONLY. It never decides what the student should study —
// that stays with the deterministic code in the confirm route (see
// GOVERNING_RULE in lib/gemini.ts).
const VISION_MEDIA_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
] as const;
const SPREADSHEET_MEDIA_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel.sheet.macroEnabled.12',                    // .xlsm — macros never execute here; only the grid is read
  'text/csv',
] as const;
// Legacy binary .xls gets its own message: it is real and common, we cannot
// read it, and "upload a photo" is the wrong advice for someone holding it.
const LEGACY_XLS = 'application/vnd.ms-excel';

interface ParseResult {
  is_timetable?: boolean;
  blocks?: unknown;
  targets?: unknown;
  syllabus_end_date?: unknown;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { file, mediaType } = (await request.json().catch(() => ({}))) as {
    file?: string; mediaType?: string;
  };
  if (!file || !mediaType) {
    return NextResponse.json({ error: 'file and mediaType required' }, { status: 400 });
  }
  const isVision = (VISION_MEDIA_TYPES as readonly string[]).includes(mediaType);
  const isSpreadsheet = (SPREADSHEET_MEDIA_TYPES as readonly string[]).includes(mediaType);
  if (mediaType === LEGACY_XLS) {
    return NextResponse.json(
      { error: 'That is an old-format .xls file. Open it and save as .xlsx, then upload again.' },
      { status: 400 },
    );
  }
  if (!isVision && !isSpreadsheet) {
    return NextResponse.json({ error: 'Upload a photo (JPG/PNG), a PDF, or an Excel file (.xlsx/.csv).' }, { status: 400 });
  }
  // ~5MB of base64. The client downscales images before sending.
  if (file.length > 7_000_000) {
    return NextResponse.json({ error: 'That file is too large — try a photo instead of a scan.' }, { status: 413 });
  }

  // The Gemini key is shared across all users, so one student re-uploading in a
  // loop must not burn everyone's quota. This is a once-or-twice-per-student
  // action, so 10/hour is generous. Fail-open if the counter errors.
  const admin = createAdminClient();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from('student_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('event', 'timetable_parsed')
    .gte('created_at', hourAgo);
  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { error: 'Too many uploads this hour — you can add your classes by hand instead.' },
      { status: 429 },
    );
  }

  let parts: GeminiPart[];
  if (isSpreadsheet) {
    // Unpack the workbook OURSELVES and hand the model labeled text. Never the
    // raw bytes: the model can't read them, and the unpacking is where all the
    // Excel quirks (times stored as day-fractions, formula cells, hidden
    // sheets) get handled deterministically instead of by guesswork.
    let sheets: SheetText[];
    try {
      sheets = mediaType === 'text/csv'
        ? csvToSheet(Buffer.from(file, 'base64').toString('utf8'))
        : await workbookToSheets(Buffer.from(file, 'base64'));
    } catch {
      return NextResponse.json(
        { error: "Couldn't open that Excel file — it may be corrupted or password-protected. Re-save it and try again." },
        { status: 422 },
      );
    }
    if (sheets.length === 0) {
      return NextResponse.json(
        { error: 'That file has no readable rows. Check the sheet has your timetable in it.' },
        { status: 422 },
      );
    }
    // Long day-plans are cut to the actionable window IN CODE, not by asking
    // the model nicely — it proved it ignores the ask and truncates its own
    // JSON instead (live-fire, 6 Aug).
    const todayIso = new Date().toISOString().slice(0, 10);
    parts = [{ text: `${spreadsheetPrompt(todayIso)}\n\nWORKBOOK CONTENT:\n\n${sheetsToPromptText(windowDatedSheets(sheets, todayIso))}` }];
  } else {
    parts = [
      { inlineData: { mimeType: mediaType, data: file } },
      { text: EXTRACT_PROMPT },
    ];
  }

  const raw = await callGemini({ parts, json: true, maxTokens: isSpreadsheet ? 8192 : 4096, temperature: 0.1 });
  if (raw === null) {
    // Transient AI failure, NOT a bad upload — don't blame the student's photo.
    return NextResponse.json(
      { error: 'The scanner is busy right now — try again in a moment, or add your classes by hand.' },
      { status: 503 },
    );
  }

  // extractJson, then the truncation rescue — a reply that died at the token
  // ceiling still carries dozens of complete, usable blocks.
  const parsed = extractJson<ParseResult>(raw) ?? salvageTruncatedJson<ParseResult>(raw);
  if (!parsed || parsed.is_timetable === false) {
    return NextResponse.json(
      { error: "That doesn't look like a class timetable. Try a clearer photo, or add your classes by hand." },
      { status: 422 },
    );
  }

  // Everything the model returned passes through the sanitizer before it is
  // shown to the student — invented topics are dropped here, not stored.
  const blocks = sanitizeBlocks(parsed.blocks);
  const targets = sanitizeTargets(parsed.targets);
  // Either shape is a successful read. Requiring class times used to reject
  // every target-style message outright — which is what most coachings
  // actually send.
  if (blocks.length === 0 && targets.length === 0) {
    return NextResponse.json(
      { error: "Couldn't read any classes or targets from that. Try a clearer photo." },
      { status: 422 },
    );
  }

  admin.from('student_events').insert({
    user_id: user.id, event: 'timetable_parsed',
    props: { blocks: blocks.length, targets: targets.length, mediaType, mapped: blocks.filter((b) => b.topic).length },
    path: null,
  }).then(({ error }) => { if (error) console.error('[timetable] event log failed', error.message); });

  // Nothing is saved yet. The student confirms first.
  return NextResponse.json({
    blocks,
    targets,
    syllabusEndDate: sanitizeSyllabusEndDate(parsed.syllabus_end_date),
  });
}
