import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { callGemini, extractJson, type GeminiPart } from '@/lib/gemini';
import { sanitizeBlocks, sanitizeSyllabusEndDate, sanitizeTargets } from '@/lib/timetable';
import { EXTRACT_PROMPT, spreadsheetPrompt, salvageTruncatedJson } from '@/lib/timetable-extract';
import { workbookToSheets, csvToSheet, sheetsToPromptText, windowDatedSheets, type SheetText } from '@/lib/workbook-text';
import { emitTimeline } from '@/lib/os/timeline';
import { refusal, type RefusalCode } from '@/lib/timetable-refusal';

export const maxDuration = 60;

/**
 * Every refusal leaves the same shape: the sentence the student reads, and the
 * code the telemetry counts. `reason` is what seven weeks of 422s were missing
 * (lib/timetable-refusal).
 */
function refuse(code: RefusalCode) {
  const r = refusal(code);
  return NextResponse.json({ error: r.message, reason: r.code }, { status: r.status });
}

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
    return refuse('file_missing');
  }
  const isVision = (VISION_MEDIA_TYPES as readonly string[]).includes(mediaType);
  const isSpreadsheet = (SPREADSHEET_MEDIA_TYPES as readonly string[]).includes(mediaType);
  if (mediaType === LEGACY_XLS) {
    return refuse('legacy_xls');
  }
  if (!isVision && !isSpreadsheet) {
    return refuse('unsupported_type');
  }
  // ~5MB of base64. The client downscales images before sending.
  if (file.length > 7_000_000) {
    return refuse('file_too_large');
  }

  // The Gemini key is shared across all users, so one student re-uploading in a
  // loop must not burn everyone's quota. This is a once-or-twice-per-student
  // action, so 10/hour is generous. Fail-open if the counter errors.
  const admin = createAdminClient();

  // FREE FOR EVERY STUDENT (founder, 8 Aug) — see the note in ../route.ts.
  // The scanner is the day-1 "wow": a student hands us the sheet their coaching
  // gave them and gets an aligned plan back in thirty seconds. Charging for
  // that was charging for the proof.
  //
  // What replaces the premium gate is a real quota, because the Gemini key is
  // shared and free students are now on it. Two ceilings, both per-student:
  // a burst limit so a retry loop can't run away, and a daily limit because
  // this is a once-or-twice-a-week action for a real student and anything
  // beyond that is either a bug or abuse.
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [{ count: lastHour }, { count: lastDay }] = await Promise.all([
    admin.from('student_events').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('event', 'timetable_parsed').gte('created_at', hourAgo),
    admin.from('student_events').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('event', 'timetable_parsed').gte('created_at', dayAgo),
  ]);
  if ((lastHour ?? 0) >= 6 || (lastDay ?? 0) >= 15) {
    return refuse('quota_exceeded');
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
      return refuse('workbook_unreadable');
    }
    if (sheets.length === 0) {
      return refuse('workbook_empty');
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

  // Patient retries: this route has 60s (maxDuration) and a student who just
  // picked a file will wait ten seconds; free-tier 429s usually clear within
  // the minute, so waiting beats telling them the scanner is busy.
  const raw = await callGemini({ parts, json: true, maxTokens: isSpreadsheet ? 8192 : 4096, temperature: 0.1, backoffBaseMs: 6000 });
  if (raw === null) {
    // Transient AI failure, NOT a bad upload — don't blame the student's photo.
    return refuse('scanner_unavailable');
  }

  // extractJson, then the truncation rescue — a reply that died at the token
  // ceiling still carries dozens of complete, usable blocks.
  const parsed = extractJson<ParseResult>(raw) ?? salvageTruncatedJson<ParseResult>(raw);
  // Two different failures wearing one face. `!parsed` is the model answering
  // in a shape we could not read — our problem. `is_timetable: false` is the
  // model reading it fine and saying it is not a timetable — the photo's.
  if (!parsed) return refuse('model_reply_unreadable');
  if (parsed.is_timetable === false) return refuse('not_a_timetable');

  // Everything the model returned passes through the sanitizer before it is
  // shown to the student — invented topics are dropped here, not stored.
  const blocks = sanitizeBlocks(parsed.blocks);
  const targets = sanitizeTargets(parsed.targets);
  // Either shape is a successful read. Requiring class times used to reject
  // every target-style message outright — which is what most coachings
  // actually send.
  if (blocks.length === 0 && targets.length === 0) {
    // Timeline: a real OCR failure — the photo was uploaded and nothing could
    // be read. This is the one OCR event that is not stored anywhere else, and
    // the one the founder alert system needs to see a failure trend.
    await emitTimeline(admin, {
      entity: 'student', entityId: user.id, kind: 'ocr_failed',
      summary: 'Timetable OCR failed — nothing readable in the photo', actor: 'student',
      metadata: { mediaType },
    });
    return refuse('nothing_readable');
  }

  admin.from('student_events').insert({
    user_id: user.id, event: 'timetable_parsed',
    props: { blocks: blocks.length, targets: targets.length, mediaType, mapped: blocks.filter((b) => b.topic || b.chapter).length },
    path: null,
  }).then(({ error }) => { if (error) console.error('[timetable] event log failed', error.message); });

  // Nothing is saved yet. The student confirms first.
  return NextResponse.json({
    blocks,
    targets,
    syllabusEndDate: sanitizeSyllabusEndDate(parsed.syllabus_end_date),
  });
}
