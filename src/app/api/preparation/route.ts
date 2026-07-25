import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { preparationIndex, topicEvidence, INDEX_MEANING, type EvidenceRow } from '@/lib/evidence';
import { HOURS_ARE_ESTIMATES, sectionHours, totalSyllabusHours, type Section } from '@/lib/prep-model';
import type { CoverageStatus } from '@/lib/study-pace';

export const maxDuration = 60;

// GET /api/preparation — the four meters, plus the topics closest to earning
// their next rung.
//
// Everything returned is auditable: for any number here we can name the rows it
// came from. Nothing here is a prediction — there is no percentile, no
// probability, no forecast of a result. See INDEX_MEANING.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const [{ data: cov }, { data: ev }, { data: mocks }] = await Promise.all([
    admin.from('topic_coverage').select('topic, status').eq('student_id', user.id),
    admin.from('topic_evidence')
      .select('topic, section, difficulty, attempted, correct, logged_for')
      .eq('student_id', user.id),
    admin.from('mock_debriefs').select('taken_on').eq('student_id', user.id)
      .order('taken_on', { ascending: false }).limit(20),
  ]);

  const declared: Record<string, CoverageStatus> = {};
  for (const c of cov ?? []) declared[c.topic as string] = (c.status as CoverageStatus) ?? 'not_started';

  const rows: EvidenceRow[] = (ev ?? []).map((r) => ({
    topic: r.topic as string, section: r.section as string,
    difficulty: r.difficulty as EvidenceRow['difficulty'],
    attempted: Number(r.attempted), correct: Number(r.correct),
    loggedFor: r.logged_for as string,
  }));

  // Mock recency is section-level, because a debrief is. We do not pretend to
  // know which individual topics a mock tested.
  const latestMock = mocks?.[0]?.taken_on as string | undefined;
  const daysAgo = latestMock
    ? Math.floor((Date.now() - Date.parse(`${latestMock}T00:00:00`)) / 86_400_000)
    : null;
  const lastMockDaysAgoBySection: Partial<Record<Section, number>> = daysAgo == null
    ? {}
    : { QA: daysAgo, DILR: daysAgo, VARC: daysAgo };

  const index = preparationIndex({ declared, rows, lastMockDaysAgoBySection });

  // The topics one rung from moving — the honest version of "what should I do
  // next": not a guess about impact, just where the least work closes a gap.
  const byTopic = new Map<string, EvidenceRow[]>();
  for (const r of rows) {
    const list = byTopic.get(r.topic);
    if (list) list.push(r); else byTopic.set(r.topic, [r]);
  }
  const nearest = Object.keys(declared)
    .filter((t) => (declared[t] ?? 'not_started') !== 'not_started')
    .map((topic) => topicEvidence(topic, {
      rows: byTopic.get(topic) ?? [],
      conceptReported: true,
      lastMockDaysAgo: daysAgo,
    }))
    .filter((e) => e.passed < e.total)
    .sort((a, b) => b.passed - a.passed || b.hours - a.hours)
    .slice(0, 5);

  return NextResponse.json({
    ...index,
    meaning: INDEX_MEANING,
    estimateNote: HOURS_ARE_ESTIMATES,
    totalHours: totalSyllabusHours(),
    sections: sectionHours(),
    mockCount: mocks?.length ?? 0,
    nearest,
  });
}
