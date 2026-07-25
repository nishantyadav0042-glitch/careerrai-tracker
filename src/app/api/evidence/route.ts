import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { isDifficulty, topicEvidence, mergeStatus, type EvidenceRow } from '@/lib/evidence';
import type { CoverageStatus } from '@/lib/study-pace';
import { getLogDateString } from '@/lib/streak-utils';

export const maxDuration = 30;

// POST /api/evidence — "I did 20 medium questions on Percentages, got 13."
//
// The one write that turns an opinion into evidence. Two numbers and a
// difficulty; everything downstream (the rung checks, the derived status, the
// Preparation Index) is computed from rows like this and never stored, so the
// rules can change without rewriting what a student actually did.
//
// It deliberately does NOT accept a status. Nothing a student sends can set
// their stage — the stage is derived from the evidence, which is the whole
// reason this table exists.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { topic, difficulty, attempted, correct, source } = body as {
    topic?: unknown; difficulty?: unknown; attempted?: unknown; correct?: unknown; source?: unknown;
  };

  if (typeof topic !== 'string' || !TOPIC_METADATA[topic]) {
    return NextResponse.json({ error: 'Unknown topic' }, { status: 400 });
  }
  if (!isDifficulty(difficulty)) {
    return NextResponse.json({ error: 'difficulty must be easy, medium, hard or timed' }, { status: 400 });
  }

  const a = Math.floor(Number(attempted));
  const c = Math.floor(Number(correct));
  if (!Number.isFinite(a) || a < 1 || a > 500) {
    return NextResponse.json({ error: 'attempted must be between 1 and 500' }, { status: 400 });
  }
  // Caught here as well as by the DB constraint: a student who mistypes should
  // get a sentence, not a 500. Accuracy over 100% would quietly discredit
  // every number built on top of it.
  if (!Number.isFinite(c) || c < 0 || c > a) {
    return NextResponse.json({ error: 'correct must be between 0 and attempted' }, { status: 400 });
  }

  const admin = createAdminClient();
  const section = TOPIC_METADATA[topic].section;

  const { error } = await admin.from('topic_evidence').insert({
    student_id: user.id, section, topic, difficulty,
    attempted: a, correct: c,
    source: source === 'routine' || source === 'log' || source === 'mock' ? source : 'manual',
    logged_for: getLogDateString(),
  });
  if (error) {
    console.error('[evidence] insert failed', error.message);
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }

  // Hand back the topic's refreshed ladder so the UI can show what that block
  // just unlocked, rather than making the student go and look.
  const { data: rows } = await admin
    .from('topic_evidence')
    .select('topic, section, difficulty, attempted, correct, logged_for')
    .eq('student_id', user.id).eq('topic', topic);

  const { data: mock } = await admin
    .from('mock_debriefs').select('taken_on')
    .eq('student_id', user.id).order('taken_on', { ascending: false }).limit(1).maybeSingle();
  const lastMockDaysAgo = mock?.taken_on
    ? Math.floor((Date.now() - Date.parse(`${mock.taken_on as string}T00:00:00`)) / 86_400_000)
    : null;

  const { data: cov } = await admin
    .from('topic_coverage').select('status')
    .eq('student_id', user.id).eq('topic', topic).maybeSingle();

  const evidence = topicEvidence(topic, {
    rows: (rows ?? []).map((r): EvidenceRow => ({
      topic: r.topic as string, section: r.section as string,
      difficulty: r.difficulty as EvidenceRow['difficulty'],
      attempted: Number(r.attempted), correct: Number(r.correct),
      loggedFor: r.logged_for as string,
    })),
    conceptReported: (cov?.status as string | undefined) != null && cov?.status !== 'not_started',
    lastMockDaysAgo,
  });

  // Keep topic_coverage in step. mergeStatus is forward-only, so a student
  // with a declared status and little evidence yet is never knocked backwards
  // — but exam_ready arrives here and nowhere else.
  const declared = (cov?.status as CoverageStatus | undefined) ?? 'not_started';
  await admin.from('topic_coverage').upsert(
    {
      student_id: user.id, section, topic,
      status: mergeStatus(declared, evidence.status),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,section,topic' },
  );

  return NextResponse.json({ ok: true, evidence });
}
