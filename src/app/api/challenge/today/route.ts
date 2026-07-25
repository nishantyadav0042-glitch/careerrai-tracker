import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { activeChallengeDate, SPLIT_MIN_ATTEMPTS, type ChallengeView } from '@/lib/challenge';

export const maxDuration = 30;

// GET /api/challenge/today — the active day's challenges, with the student's
// own state merged in.
//
// The correct answer and explanation are only included for challenges this
// student has ALREADY answered — the payload for an unanswered question never
// contains the answer, so it can't be read out of the network tab before
// attempting.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const date = activeChallengeDate();

  const { data: challenges } = await admin
    .from('daily_challenges')
    .select('id, section, topic, question, options, correct_index, difficulty, explanation, source, contributor_id')
    .eq('status', 'live').eq('live_date', date)
    .order('section');

  if (!challenges || challenges.length === 0) {
    return NextResponse.json({ date, challenges: [] });
  }

  const ids = challenges.map((c) => c.id as string);
  const [{ data: myAttempts }, { data: allAttempts }, { data: coverage }] = await Promise.all([
    admin.from('challenge_attempts').select('challenge_id, choice, is_correct')
      .eq('student_id', user.id).in('challenge_id', ids),
    admin.from('challenge_attempts').select('challenge_id, is_correct').in('challenge_id', ids),
    admin.from('topic_coverage').select('topic, status').eq('student_id', user.id)
      .in('topic', challenges.map((c) => c.topic as string)),
  ]);

  // Anonymous by rule (founder, 25 Jul): student-sourced questions say "a
  // CareerRai student", never a real name. The goal is helping students, not
  // making one student a star.

  const mine = new Map((myAttempts ?? []).map((a) => [a.challenge_id as string, a]));
  const coverageByTopic = new Map((coverage ?? []).map((c) => [c.topic as string, (c.status as string) ?? 'not_started']));

  const stats = new Map<string, { total: number; correct: number }>();
  for (const a of allAttempts ?? []) {
    const s = stats.get(a.challenge_id as string) ?? { total: 0, correct: 0 };
    s.total += 1;
    if (a.is_correct) s.correct += 1;
    stats.set(a.challenge_id as string, s);
  }

  const views: ChallengeView[] = challenges.map((c) => {
    const my = mine.get(c.id as string);
    const st = stats.get(c.id as string) ?? { total: 0, correct: 0 };
    return {
      id: c.id as string,
      section: c.section as string,
      topic: c.topic as string,
      question: c.question as string,
      options: (c.options as string[]) ?? [],
      difficulty: c.difficulty as string,
      contributorName: c.contributor_id ? 'a CareerRai student' : null,
      attempt: my ? {
        choice: Number(my.choice),
        isCorrect: my.is_correct === true,
        correctIndex: Number(c.correct_index),
        explanation: c.explanation as string,
        communityCorrectPct: st.total >= SPLIT_MIN_ATTEMPTS ? Math.round((st.correct / st.total) * 100) : null,
        attemptCount: st.total,
        coverageStatus: coverageByTopic.get(c.topic as string) ?? 'not_started',
      } : null,
    };
  });

  return NextResponse.json({ date, challenges: views });
}
