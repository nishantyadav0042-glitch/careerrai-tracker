import { NextRequest, NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

const anthropic = new Anthropic();

// Structured-output schema: every field nullable so missing values on the
// scorecard come back as null instead of hallucinated numbers.
const nullable = (type: 'integer' | 'number' | 'string') => ({
  anyOf: [{ type }, { type: 'null' }],
});

const SECTION_SCHEMA = {
  type: 'object',
  properties: {
    attempted: nullable('integer'),
    correct: nullable('integer'),
    time_min: nullable('integer'),
    percentile: nullable('number'),
  },
  required: ['attempted', 'correct', 'time_min', 'percentile'],
  additionalProperties: false,
};

const SCORECARD_SCHEMA = {
  type: 'object',
  properties: {
    is_scorecard: {
      type: 'boolean',
      description: 'true only if the image is actually a mock test scorecard/result page',
    },
    mock_name: {
      ...nullable('string'),
      description: 'Test series + mock name if visible, e.g. "SIMCAT 5"',
    },
    overall_percentile: nullable('number'),
    overall_score: nullable('number'),
    varc: SECTION_SCHEMA,
    dilr: SECTION_SCHEMA,
    qa: SECTION_SCHEMA,
  },
  required: ['is_scorecard', 'mock_name', 'overall_percentile', 'overall_score', 'varc', 'dilr', 'qa'],
  additionalProperties: false,
};

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export async function POST(request: NextRequest) {
  try {
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

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      output_config: {
        format: {
          type: 'json_schema',
          schema: SCORECARD_SCHEMA,
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType as AllowedMediaType, data: image },
            },
            {
              type: 'text',
              text: `This is a screenshot of a CAT mock test scorecard (could be from SIMCAT, AIMCAT, CL, iQuanta, or any test series). Extract the scores.

Notes:
- CAT sections are VARC (Verbal Ability & Reading Comprehension), DILR (Data Interpretation & Logical Reasoning), and QA (Quantitative Ability/Aptitude). Map whatever section names appear to these three.
- "attempted" = questions attempted, "correct" = correct answers, "time_min" = time spent in minutes, "percentile" = sectional percentile.
- Use null for anything not visible on the scorecard. Never guess or compute values that aren't shown.
- If the image is not a test scorecard at all, set is_scorecard to false and everything else to null.`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'Could not read this image' }, { status: 422 });
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No data extracted' }, { status: 422 });
    }

    const parsed = JSON.parse(textBlock.text);
    if (!parsed.is_scorecard) {
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
