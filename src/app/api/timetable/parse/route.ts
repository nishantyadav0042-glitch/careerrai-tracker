import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { callGemini, extractJson, type GeminiPart } from '@/lib/gemini';
import { ALLOWED_TOPICS, sanitizeBlocks, sanitizeSyllabusEndDate, sanitizeTargets } from '@/lib/timetable';
import { workbookToSheets, csvToSheet, sheetsToPromptText, type SheetText } from '@/lib/workbook-text';

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

const VISION_PREFACE = `You are reading a photo, screenshot or PDF of something a CAT coaching institute gave a student (Rodha, TIME, IMS, CL, Endeavor, Cracku, Unacademy...).`;
// Spreadsheet plans are usually richer than a photographed class timetable —
// Shreya's real file (the format this preface is tuned against) is a 117-row
// dated day-plan with one task column PER SECTION, plus a weekly phase sheet.
// Two rules below exist specifically for that shape: a day-plan without clock
// times IS a timetable, and long plans are windowed to the next three weeks so
// the output can never truncate mid-JSON (the failure the founder hit live:
// truncated output parses as nothing, and a perfect file gets "that doesn't
// look like a timetable").
const spreadsheetPreface = (todayIso: string) => `You are reading the TEXT extracted from an Excel/CSV file a CAT coaching institute or mentor gave a student. Each sheet of the workbook appears below under a === SHEET: "name" === header. Cells are separated by " | ", one row per line. Sheet names carry meaning — "Daily"/"Day wise" is usually a day plan, "Weekly"/"Schedule" a class timetable or phase plan, "Targets" a target list. Read EVERY sheet; the answer merges all of them.

SPREADSHEET-SPECIFIC RULES (these OVERRIDE anything below that conflicts):
- A DAY-PLAN GRID — dated or Day-N rows where each row describes study tasks (often one column per section: "VARC task", "QA task", "DILR task") — IS a timetable. Set "is_timetable": true even when no clock times appear anywhere.
- For such rows output one block PER SECTION TASK: the row's date (or dayIndex), that column's section, "start"/"end" null, "topic" matched from the allowed list when the cell names one, "label" a SHORT version of the cell text (max ~10 words).
- TODAY is ${todayIso}. If the plan spans MORE than 30 dated days, output blocks ONLY for dates from ${todayIso} through 21 days later — earlier rows are the past and later rows will still be here next week. Weekly/phase sheets and targets are NOT windowed: read those whole.
- Rows marked OFF / blackout / rest / holiday are days off — skip them entirely, exactly as the skip rule below says.
- A week-level phase sheet ("Week 5 | 07 Sep-13 Sep | Algebra I | ... | 1 full mock + 2 sectionals") does not produce class blocks, but its tests/mocks column often states real targets — extract those, and a printed syllabus-completion week ("Syllabus closure") may state syllabus_end_date only if an actual end date is printed.`;

const EXTRACT_RULES = `It may be ANY of these, and often it is not a timetable at all:
 (a) a weekly class timetable with days and times,
 (b) a TARGET / strategy message listing how much to complete ("15-20 Quant sectionals by end September", "200 LRDI sets", "100+ topic tests"),
 (c) both.

Extract whatever is actually there. An empty list is correct when that thing isn't present — do NOT invent class times for a target message, and do NOT invent targets for a plain timetable. Return STRICT JSON only:

{
  "is_timetable": boolean,
  "syllabus_end_date": "YYYY-MM-DD" or null,
  "blocks": [
    { "day": 0, "date": null, "dayIndex": null, "start": "18:00", "end": "20:00", "section": "QA", "topic": "Time Speed Distance", "label": "Arithmetic - TSD" }
  ],
  "targets": [
    { "kind": "sectional", "label": "15-20 Quant sectionals by end September", "count": 20, "section": "QA", "deadline": "2026-09-30" },
    { "kind": "sets", "label": "200 LRDI sets", "count": 200, "section": "DILR", "deadline": null }
  ]
}

RULES — follow exactly:
- "is_timetable": false if this image is clearly not a class schedule. Then return an empty blocks array.
CLASS ROWS — sheets come in three shapes. Use whichever the sheet actually is, and set the other two anchors to null:
  A. RECURRING WEEKLY ("Mon 6-8pm Arithmetic") -> "day": 0=Monday ... 6=Sunday.
  B. DATED CALENDAR ("26 Sep 23 | Tuesday | 10 PM-12 AM | Quant | Geometry Basics 1")
     -> "date": "YYYY-MM-DD". Use the printed date. A two-digit year like "23" means 2023.
        Also set "day" when the weekday is printed. NEVER drop the date — a dated
        syllabus is a sequence, and collapsing it to weekdays destroys the order.
  C. RELATIVE DAY PLAN ("Day 1 ... Day 5", each with hourly slots)
     -> "dayIndex": 1, 2, 3 ... Do NOT invent a weekday or a date for these.
At least one of day / date / dayIndex MUST be set, or omit the row.
- "start"/"end": 24-hour "HH:MM", zero padded. Infer am/pm sensibly from the batch: an evening batch's "6-8" means 18:00-20:00, a morning slot's "9 AM - 10 AM" means 09:00-10:00. Late batches really do run "10 PM - 12 AM" (22:00 to 00:00) — record that as given.
- For entries with NO usable time ("Whole Day", "Practice Session", "Rest"), set both "start" and "end" to null. Do not invent hours.
- SKIP rows that are holidays, blank days or breaks with no study content (e.g. a row that only says "Sunday", "Dussehra", "LUNCH BREAK"). A colour-filled empty row is a day off, not a class.
- "section": exactly one of "QA", "VARC", "DILR", or null if unclear.
    QA = Quantitative Aptitude / Maths / Arithmetic / Algebra / Geometry / Number System.
    VARC = Verbal / English / Reading Comprehension / Grammar / Vocabulary.
    DILR = Data Interpretation / Logical Reasoning / LRDI / DI-LR.
- "topic": MUST be copied EXACTLY from the ALLOWED TOPICS list below, or null.
    Choose the closest match by meaning (e.g. "TSD" -> "Time Speed Distance", "P&C" -> "Permutation & Combination", "RC" -> "Reading Comprehension").
    If nothing in the list clearly matches, use null. NEVER invent a topic name and NEVER return a topic that is not in the list character-for-character.
- "label": the raw text as printed on the timetable, so nothing is lost.
- Ignore breaks, lunch, holidays, test/mock slots that name no topic — unless they are actual scheduled classes.
- If the same class repeats on several days, output one block per day.
TARGETS — how much work the coaching expects completed:
- "kind": one of "sectional", "topic_test", "mock", "questions", "sets", "revision", "classes", "other".
- "count": the number to complete, as an integer. For a RANGE like "15-20", use the HIGHER number (20). For "100-150+", use 150. If no number is given (e.g. "complete Arithmetic revision"), use null. NEVER guess a number.
- "section": "QA", "VARC", "DILR", or null.
- "label": the target in the coaching's own words, kept short.
- "deadline": "YYYY-MM-DD" only if a real date or month-end is stated ("by end September" -> that month's last day of the CURRENT year). Otherwise null.
- Ignore motivational lines, greetings and general advice. Only extract things with a countable or completable deliverable.

- "syllabus_end_date": ONLY if the document literally prints a date on which the syllabus/course finishes (e.g. "Course ends 30 Nov 2026", "Syllabus completion: 15/10/2026"). Return it as "YYYY-MM-DD". If no such date is printed anywhere, return null. NEVER estimate, infer, or calculate this date — a wrong date here damages the student's whole study plan. When unsure, return null.

ALLOWED TOPICS (the ONLY permitted values for "topic"):
${ALLOWED_TOPICS.join('\n')}`;

const EXTRACT_PROMPT = `${VISION_PREFACE}\n\n${EXTRACT_RULES}`;
const spreadsheetPrompt = (todayIso: string) => `${spreadsheetPreface(todayIso)}\n\n${EXTRACT_RULES}`;

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
    parts = [{ text: `${spreadsheetPrompt(new Date().toISOString().slice(0, 10))}\n\nWORKBOOK CONTENT:\n\n${sheetsToPromptText(sheets)}` }];
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

  const parsed = extractJson<ParseResult>(raw);
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
