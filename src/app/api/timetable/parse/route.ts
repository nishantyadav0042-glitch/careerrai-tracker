import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { callGemini, extractJson, type GeminiPart } from '@/lib/gemini';
import { ALLOWED_TOPICS, sanitizeBlocks } from '@/lib/timetable';

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

const EXTRACT_PROMPT = `You are reading a photo or PDF of a COACHING CLASS TIMETABLE for a CAT exam student (Indian MBA entrance coaching, e.g. TIME, IMS, CL, Endeavor).

Extract every scheduled class you can see. Return STRICT JSON only:

{
  "is_timetable": boolean,
  "blocks": [
    { "day": 0, "start": "18:00", "end": "20:00", "section": "QA", "topic": "Time Speed Distance", "label": "Arithmetic - TSD" }
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

ALLOWED TOPICS (the ONLY permitted values for "topic"):
${ALLOWED_TOPICS.join('\n')}`;

interface ParseResult {
  is_timetable?: boolean;
  blocks?: unknown;
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
  if (blocks.length === 0) {
    return NextResponse.json(
      { error: "Couldn't read any classes from that. Try a clearer photo, or add your classes by hand." },
      { status: 422 },
    );
  }

  admin.from('student_events').insert({
    user_id: user.id, event: 'timetable_parsed',
    props: { blocks: blocks.length, mediaType, mapped: blocks.filter((b) => b.topic).length },
    path: null,
  }).then(({ error }) => { if (error) console.error('[timetable] event log failed', error.message); });

  // Nothing is saved yet. The student confirms first.
  return NextResponse.json({ blocks });
}
