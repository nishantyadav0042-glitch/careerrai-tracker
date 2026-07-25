import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { activeChallengeDate, SPLIT_MIN_ATTEMPTS } from '@/lib/challenge';
import { getLogDateString } from '@/lib/streak-utils';

export const maxDuration = 30;

// POST /api/challenge/attempt — the moment that separates us from every other
// daily-question product: the answer doesn't evaporate into a chat scroll, it
// becomes a topic_evidence row. One question answered = one permanent piece of
// this student's preparation record.
//
// Deliberately NOT connected to the streak (founder decision, 25 Jul): a
// 2-minute question is not a studied day, and there is exactly one streak.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { challenge_id: challengeId, choice, seconds } = body as {
    challenge_id?: unknown; choice?: unknown; seconds?: unknown;
  };
  const ch = Math.floor(Number(choice));
  if (typeof challengeId !== 'string' || !Number.isFinite(ch) || ch < 0 || ch > 5) {
    return NextResponse.json({ error: 'challenge_id and choice required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: challenge } = await admin
    .from('daily_challenges')
    .select('id, live_date, status, section, topic, options, correct_index, difficulty, explanation')
    .eq('id', challengeId).maybeSingle();

  // Only the active day's live challenge is answerable — yesterday's stays
  // readable but closed, so the community split stops moving once a day ends.
  if (!challenge || challenge.status !== 'live' || challenge.live_date !== activeChallengeDate()) {
    return NextResponse.json({ error: 'This challenge is not open' }, { status: 400 });
  }
  const optionCount = Array.isArray(challenge.options) ? (challenge.options as unknown[]).length : 0;
  if (ch >= optionCount) return NextResponse.json({ error: 'Invalid choice' }, { status: 400 });

  const isCorrect = ch === Number(challenge.correct_index);
  const secs = Number.isFinite(Number(seconds)) ? Math.max(0, Math.min(3600, Math.floor(Number(seconds)))) : null;

  const { error: insErr } = await admin.from('challenge_attempts').insert({
    student_id: user.id, challenge_id: challengeId, choice: ch,
    is_correct: isCorrect, seconds_taken: secs,
  });
  if (insErr) {
    // Unique violation = already answered. The first answer stands, always.
    const already = insErr.code === '23505';
    return NextResponse.json(
      { error: already ? 'Already answered' : 'Could not save' },
      { status: already ? 409 : 500 },
    );
  }

  // The integration beat. Failure here must not eat the verdict — log loudly,
  // the attempt row is the recoverable source for a later backfill.
  const { error: evErr } = await admin.from('topic_evidence').insert({
    student_id: user.id,
    section: challenge.section, topic: challenge.topic,
    difficulty: challenge.difficulty,
    attempted: 1, correct: isCorrect ? 1 : 0,
    source: 'daily', logged_for: getLogDateString(),
  });
  if (evErr) console.error('[challenge] evidence write failed', evErr.message);

  const [{ data: allAttempts }, { data: cov }] = await Promise.all([
    admin.from('challenge_attempts').select('is_correct').eq('challenge_id', challengeId),
    admin.from('topic_coverage').select('status').eq('student_id', user.id)
      .eq('topic', challenge.topic).maybeSingle(),
  ]);
  const total = allAttempts?.length ?? 0;
  const correct = (allAttempts ?? []).filter((a) => a.is_correct).length;

  return NextResponse.json({
    isCorrect,
    correctIndex: Number(challenge.correct_index),
    explanation: challenge.explanation,
    communityCorrectPct: total >= SPLIT_MIN_ATTEMPTS ? Math.round((correct / total) * 100) : null,
    attemptCount: total,
    topic: challenge.topic,
    coverageStatus: (cov?.status as string) ?? 'not_started',
  });
}
