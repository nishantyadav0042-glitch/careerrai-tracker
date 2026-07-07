import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { QUANT_TOPICS, VERBAL_TOPICS, LRDI_TOPICS, TOPIC_METADATA } from '@/lib/topics-constants';

const VALID_SECTIONS = ['VARC', 'DILR', 'QA'] as const;
const VALID_STATUSES = ['not_started', 'started', 'completed', 'strong'] as const;

const TOPICS_BY_SECTION: Record<(typeof VALID_SECTIONS)[number], string[]> = {
  VARC: VERBAL_TOPICS,
  DILR: LRDI_TOPICS,
  QA: QUANT_TOPICS,
};

// Prerequisite-informed order, not raw array/DB order — a topic like
// Geometry reading before Arithmetic in the grid would silently contradict
// the sequencing this same metadata is meant to encode.
function bySequence<T extends { topic: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (TOPIC_METADATA[a.topic]?.sequenceRank ?? 99) - (TOPIC_METADATA[b.topic]?.sequenceRank ?? 99));
}

// GET /api/coverage — the Coverage Matrix. First view seeds every topic at
// not_started — the honest zero state. It does NOT infer statuses from
// current_stage: one "I'm solving questions" tap used to mark all 14 topics
// "completed," which fabricated a coverage picture the student never gave
// (and made Study Memory contradict itself: "Completed once" next to
// "haven't started this yet"). Coverage is the student's explicit,
// per-topic declaration — the Blueprint Builder collects it, nothing
// invents it.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('topic_coverage')
    .select('section, topic, status, updated_at')
    .eq('student_id', user.id);

  if (existing && existing.length > 0) {
    return NextResponse.json({ matrix: bySequence(existing) });
  }

  const seedRows = (VALID_SECTIONS as readonly string[]).flatMap((section) =>
    TOPICS_BY_SECTION[section as (typeof VALID_SECTIONS)[number]].map((topic) => ({
      student_id: user.id,
      section,
      topic,
      status: 'not_started' as const,
    }))
  );

  const { data: inserted, error } = await admin
    .from('topic_coverage')
    .upsert(seedRows, { onConflict: 'student_id,section,topic' })
    .select('section, topic, status, updated_at');
  if (error || !inserted) return NextResponse.json({ error: 'Could not seed coverage matrix' }, { status: 500 });

  return NextResponse.json({ matrix: bySequence(inserted) });
}

interface MatrixEntry { section?: string; topic?: string; status?: string }

function validateEntry({ section, topic, status }: MatrixEntry): string | null {
  if (!section || !(VALID_SECTIONS as readonly string[]).includes(section)) return 'section must be VARC, DILR, or QA';
  if (!topic || !TOPICS_BY_SECTION[section as (typeof VALID_SECTIONS)[number]].includes(topic)) return 'topic is not valid for section';
  if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) return 'status is not a recognised value';
  return null;
}

// POST /api/coverage — persist coverage. Two shapes:
//  { section, topic, status }  — one topic (the Analysis page's tap-to-update)
//  { matrix: [...] }           — the whole grid in one call (the Blueprint
//                                Builder's explicit per-topic declaration)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as MatrixEntry & { matrix?: MatrixEntry[] };

  if (Array.isArray(body.matrix)) {
    if (body.matrix.length === 0 || body.matrix.length > 50) {
      return NextResponse.json({ error: 'matrix must have 1-50 entries' }, { status: 400 });
    }
    for (const entry of body.matrix) {
      const problem = validateEntry(entry);
      if (problem) return NextResponse.json({ error: `${entry.section ?? '?'}/${entry.topic ?? '?'}: ${problem}` }, { status: 400 });
    }
    const now = new Date().toISOString();
    const admin = createAdminClient();
    const { error } = await admin
      .from('topic_coverage')
      .upsert(
        body.matrix.map((e) => ({ student_id: user.id, section: e.section!, topic: e.topic!, status: e.status!, updated_at: now })),
        { onConflict: 'student_id,section,topic' }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, saved: body.matrix.length });
  }

  const { section, topic, status } = body;
  if (!section || !(VALID_SECTIONS as readonly string[]).includes(section)) {
    return NextResponse.json({ error: 'section must be VARC, DILR, or QA' }, { status: 400 });
  }
  if (!topic || !TOPICS_BY_SECTION[section as (typeof VALID_SECTIONS)[number]].includes(topic)) {
    return NextResponse.json({ error: 'topic is not valid for section' }, { status: 400 });
  }
  if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'status is not a recognised value' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('topic_coverage')
    .upsert(
      { student_id: user.id, section, topic, status, updated_at: new Date().toISOString() },
      { onConflict: 'student_id,section,topic' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
