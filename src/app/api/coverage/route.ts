import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { UNIT_ORDER } from '@/lib/topics-constants';
import { VALID_SECTIONS, TOPICS_BY_SECTION, validateCoverageEntry, type MatrixEntry } from '@/lib/coverage-validate';
import { serverError } from '@/lib/api-error';

// Canonical Knowledge Graph order, not raw DB order — the grid always
// renders sections and units the way the graph defines them.
function byGraphOrder<T extends { topic: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (UNIT_ORDER[a.topic] ?? 999) - (UNIT_ORDER[b.topic] ?? 999));
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
    return NextResponse.json({ matrix: byGraphOrder(existing) });
  }

  const seedRows = VALID_SECTIONS.flatMap((section) =>
    TOPICS_BY_SECTION[section].map((topic) => ({
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

  return NextResponse.json({ matrix: byGraphOrder(inserted) });
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
    if (body.matrix.length === 0 || body.matrix.length > 80) {
      return NextResponse.json({ error: 'matrix must have 1-80 entries' }, { status: 400 });
    }
    for (const entry of body.matrix) {
      const problem = validateCoverageEntry(entry, false);
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
    if (error) return serverError('coverage', error);
    return NextResponse.json({ ok: true, saved: body.matrix.length });
  }

  const { section, topic, status } = body;
  // Single-topic path: the Analysis page tap cycles student states only —
  // exam_ready still cannot be self-assigned from any UI.
  const problem = validateCoverageEntry(body, false);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('topic_coverage')
    .upsert(
      { student_id: user.id, section, topic, status, updated_at: new Date().toISOString() },
      { onConflict: 'student_id,section,topic' }
    );
  if (error) return serverError('coverage', error);

  return NextResponse.json({ ok: true });
}
