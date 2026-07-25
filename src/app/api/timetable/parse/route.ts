import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { callGemini, extractJson, type GeminiPart } from '@/lib/gemini';
import { ALLOWED_TOPICS, sanitizeBlocks, sanitizeSyllabusEndDate, sanitizeTargets } from '@/lib/timetable';

export const maxDuration = 60;

// Coaching timetable -> structured blocks.
//
// No OCR library and no PDF parser: Gemini reads the image (or PDF) directly,
// which is the same path /api/parse-scorecard already uses for mock scorecards.
// A blurry phone photo of a printed handout is the realistic input, and that's
// exactly what this handles best.
//
// This route EXTRACTS ONLY. It never decides what the student should study —
// that stays with the deterministic code in the confirm route (see
// GOVERNING_RULE in lib/gemini.ts).
const ALLOWED_MEDIA_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

const EXTRACT_PROMPT = `You are reading a photo, screenshot or PDF of something a CAT coaching institute gave a student (Rodha, TIME, IMS, CL, Endeavor, Cracku, Unacademy...).

It may be ANY of these, and often it is not a timetable at all:
 (a) a weekly class timetable with days and times,
 (b) a TARGET / strategy message listing how much to complete ("15-20 Quant sectionals by end September", "200 LRDI sets", "100+ topic tests"),
 (c) both.

Extract whatever is actually there. An empty list is correct when that thing isn't present — do NOT invent class times for a target message, and do NOT invent targets for a plain timetable. Return STRICT JSON only:

{
  "is_timetable": boolean,
  "syllabus_end_date": "YYYY-MM-DD" or null,
  "blocks": [
    { "day": 0, "start": "18:00", "end": "20:00", "section": "QA", "topic": "Time Speed Distance", "label": "Arithmetic - TSD" }
  ],
  "targets": [
    { "kind": "sectional", "label": "15-20 Quant sectionals by end September", "count": 20, "section": "QA", "deadline": "2026-09-30" },
    { "kind": "sets", "label": "200 LRDI sets", "count": 200, "section": "DILR", "deadline": null }
  ]
}

RULES — follow exactly:
- "is_timetable": false if this image is clearly not a class schedule. Then return an empty blocks array.
- "day": integer, 0=Monday, 1=Tuesday ... 6=Sunday.
- "start"/"end": 24-hour "HH:MM", zero padded. Infer am/pm sensibly — coaching classes run roughly 06:00-22:00, so "6-8" on an evening batch means 18:00-20:00. If a class has no end time, add 2 hours.
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
  if (!ALLOWED_MEDIA_TYPES.includes(mediaType as AllowedMediaType)) {
    return NextResponse.json({ error: 'Upload a photo (JPG/PNG) or a PDF.' }, { status: 400 });
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

  const parts: GeminiPart[] = [
    { inlineData: { mimeType: mediaType, data: file } },
    { text: EXTRACT_PROMPT },
  ];

  const raw = await callGemini({ parts, json: true, maxTokens: 4096, temperature: 0.1 });
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
