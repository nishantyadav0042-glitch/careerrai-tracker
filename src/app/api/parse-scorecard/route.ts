import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { callGemini, extractJson, geminiEnabled } from '@/lib/gemini';
import type { GeminiPart } from '@/lib/gemini';

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

interface SectionResult {
  attempted: number | null;
  correct: number | null;
  time_min: number | null;
  percentile: number | null;
}

interface ScorecardResult {
  is_scorecard: boolean;
  mock_name: string | null;
  overall_percentile: number | null;
  overall_score: number | null;
  varc: SectionResult;
  dilr: SectionResult;
  qa: SectionResult;
}

const EXTRACT_PROMPT = `This is a screenshot of a CAT mock test scorecard. Extract the data and return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "is_scorecard": true,
  "mock_name": "SIMCAT 5",
  "overall_percentile": 85.5,
  "overall_score": 142,
  "varc": { "attempted": 24, "correct": 18, "time_min": 40, "percentile": 82.0 },
  "dilr": { "attempted": 20, "correct": 14, "time_min": 45, "percentile": 78.0 },
  "qa": { "attempted": 22, "correct": 16, "time_min": 35, "percentile": 88.0 }
}

Rules:
- CAT sections are VARC, DILR, and QA. Map whatever section names appear to these three.
- "attempted" = questions attempted, "correct" = correct answers, "time_min" = time in minutes, "percentile" = sectional percentile.
- Use null for any value not visible on the scorecard. Never guess or compute values.
- If this is NOT a test scorecard, set is_scorecard to false and every other value to null.
- Return the raw JSON only — no surrounding text.`;

export async function POST(request: NextRequest) {
  try {
    if (!geminiEnabled()) {
      return NextResponse.json(
        { error: 'Scorecard scanner is not available — contact support.' },
        { status: 503 }
      );
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { image, mediaType } = (await request.json()) as { image?: string; mediaType?: string };
    if (!image || !mediaType) {
      return NextResponse.json({ error: 'image and mediaType required' }, { status: 400 });
    }
    if (!ALLOWED_MEDIA_TYPES.includes(mediaType as AllowedMediaType)) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    }
    // ~4MB base64 ceiling — client downscales before upload
    if (image.length > 5_500_000) {
      return NextResponse.json({ error: 'Image too large — try a tighter screenshot' }, { status: 413 });
    }

    // The Gemini key is shared across all users on the free tier, so one student
    // hammering the scanner can exhaust quota for everyone. Cap at 30 scans/user/hr.
    // Fail-open: if the counter query errors, allow the request.
    const admin = createAdminClient();
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .eq('event_type', 'scorecard_parse')
      .gte('created_at', hourAgo);
    if ((count ?? 0) >= 30) {
      return NextResponse.json(
        { error: 'Too many scans this hour — try again shortly, or enter the numbers manually.' },
        { status: 429 }
      );
    }
    // Count this attempt (fire-and-forget).
    admin
      .from('analytics_events')
      .insert({ student_id: user.id, event_type: 'scorecard_parse', metadata: {} })
      .then(({ error: e }) => { if (e) console.error('scorecard rate-limit log failed:', e.message); });

    const parts: GeminiPart[] = [
      { inlineData: { mimeType: mediaType, data: image } },
      { text: EXTRACT_PROMPT },
    ];

    const raw = await callGemini({ parts, json: true, maxTokens: 512, temperature: 0.1 });
    if (raw === null) {
      // Transient AI failure (rate-limit / 5xx / network) — NOT a bad image.
      // Distinct status so the client can say "try again" rather than "invalid".
      return NextResponse.json(
        { error: 'The scanner is busy right now — try again in a moment, or enter the numbers manually.' },
        { status: 503 }
      );
    }

    const parsed = extractJson<ScorecardResult>(raw);
    if (!parsed || !parsed.is_scorecard) {
      return NextResponse.json(
        { error: "That doesn't look like a mock scorecard — try a screenshot of your result page" },
        { status: 422 }
      );
    }

    return NextResponse.json({ scorecard: parsed });
  } catch (error) {
    console.error('parse-scorecard error:', error);
    return NextResponse.json({ error: 'Failed to parse scorecard' }, { status: 500 });
  }
}
