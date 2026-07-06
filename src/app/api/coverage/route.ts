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

// Current Stage pre-fills the whole 14-topic grid so a first-time view is a
// review-and-correct step (0-4 taps for most students), not a 14-tap chore —
// see Coverage Matrix, Study Plan Generator Bible Part 4.
const STAGE_DEFAULT_STATUS: Record<string, (typeof VALID_STATUSES)[number]> = {
  not_started: 'not_started',
  concepts: 'started',
  questions: 'completed',
  sectionals: 'completed',
  mocks: 'completed',
};

// Prerequisite-informed order, not raw array/DB order — a topic like
// Geometry reading before Arithmetic in the grid would silently contradict
// the sequencing this same metadata is meant to encode.
function bySequence<T extends { topic: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (TOPIC_METADATA[a.topic]?.sequenceRank ?? 99) - (TOPIC_METADATA[b.topic]?.sequenceRank ?? 99));
}

// GET /api/coverage — the Coverage Matrix. Seeds all 14 topics from the
// student's current_stage on first view (persisted immediately so later
// edits are updates, not blind inserts); returns the stored grid on every
// later call, since Phase 0 diagnostics / mock error buckets are meant to
// correct it over time rather than re-deriving it from stage every time.
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

  const { data: profile } = await admin
    .from('profiles')
    .select('current_stage')
    .eq('id', user.id)
    .single();
  const defaultStatus = STAGE_DEFAULT_STATUS[(profile?.current_stage as string) ?? ''] ?? 'not_started';

  const seedRows = (VALID_SECTIONS as readonly string[]).flatMap((section) =>
    TOPICS_BY_SECTION[section as (typeof VALID_SECTIONS)[number]].map((topic) => ({
      student_id: user.id,
      section,
      topic,
      status: defaultStatus,
    }))
  );

  const { data: inserted, error } = await admin
    .from('topic_coverage')
    .upsert(seedRows, { onConflict: 'student_id,section,topic' })
    .select('section, topic, status, updated_at');
  if (error || !inserted) return NextResponse.json({ error: 'Could not seed coverage matrix' }, { status: 500 });

  return NextResponse.json({ matrix: bySequence(inserted) });
}

// POST /api/coverage — update one topic's status. One tap cycles a topic to
// the next status client-side; this just persists the result of that cycle.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as { section?: string; topic?: string; status?: string };
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
