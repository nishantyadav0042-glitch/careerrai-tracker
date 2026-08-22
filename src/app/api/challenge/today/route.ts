import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { activeChallengeDate, SPLIT_MIN_ATTEMPTS, targetFor, type ChallengeView } from '@/lib/challenge';

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

  const { data: challenges, error: chalErr } = await admin
    .from('daily_challenges')
    .select('id, section, topic, kind, question, options, correct_index, difficulty, explanation, source, target_seconds')
    .eq('status', 'live').eq('live_date', date)
    .order('section');
  // Hardening sprint (21 Aug): a failed read used to render as "no question
  // today" — the day's hero surface deleted by a blip, invisible to everyone.
  if (chalErr) {
    return NextResponse.json({ error: 'Could not load today’s question — try again.', code: 'CHALLENGE_UNAVAILABLE', retryable: true }, { status: 503 });
  }
  if (!challenges || challenges.length === 0) {
    return NextResponse.json({ date, challenges: [] });
  }

  const ids = challenges.map((c) => c.id as string);
  const [{ data: myAttempts }, { data: allAttempts }, { data: coverage }] = await Promise.all([
    admin.from('challenge_attempts').select('challenge_id, choice, is_correct, seconds_taken')
      .eq('student_id', user.id).in('challenge_id', ids),
    admin.from('challenge_attempts').select('challenge_id, is_correct, seconds_taken').in('challenge_id', ids),
    admin.from('topic_coverage').select('topic, status').eq('student_id', user.id)
      .in('topic', challenges.map((c) => c.topic as string)),
  ]);

  // ── No real names, ever (hardening sprint, 21 Aug — supersedes 13 Aug) ────
  //
  // This route used to join profiles.full_name and render "Shared by {real
  // name}". The path was dormant (nothing writes contributor_id), but it was
  // one INSERT away from putting a student's actual identity on a shared
  // surface. Founder's locked rule: contribution feedback is IMPACT, not
  // identity — the community pipeline's anonymous display names are the only
  // byline mechanism anywhere. Content here stands on its section and topic.

  const mine = new Map((myAttempts ?? []).map((a) => [a.challenge_id as string, a]));
  const coverageByTopic = new Map((coverage ?? []).map((c) => [c.topic as string, (c.status as string) ?? 'not_started']));

  // Correctness and the clock, tallied together — the card's finished state
  // reports both, and reporting them from two different reads is how they
  // start disagreeing. "In time" is judged against EACH question's own clock
  // (target_seconds), never one shared 90.
  const targetById = new Map(challenges.map((c) => [c.id as string, targetFor(c)]));
  const stats = new Map<string, { total: number; correct: number; timed: number; inTime: number }>();
  for (const a of allAttempts ?? []) {
    const s = stats.get(a.challenge_id as string) ?? { total: 0, correct: 0, timed: 0, inTime: 0 };
    s.total += 1;
    if (a.is_correct) s.correct += 1;
    if (typeof a.seconds_taken === 'number') {
      s.timed += 1;
      if ((a.seconds_taken as number) <= (targetById.get(a.challenge_id as string) ?? 90)) s.inTime += 1;
    }
    stats.set(a.challenge_id as string, s);
  }

  const views: ChallengeView[] = challenges.map((c) => {
    const my = mine.get(c.id as string);
    const st = stats.get(c.id as string) ?? { total: 0, correct: 0, timed: 0, inTime: 0 };
    const yourSeconds = typeof my?.seconds_taken === 'number' ? (my.seconds_taken as number) : null;
    const target = targetFor(c);
    return {
      id: c.id as string,
      section: c.section as string,
      topic: c.topic as string,
      kind: ((c.kind as string) ?? 'question') as ChallengeView['kind'],
      question: c.question as string,
      options: (c.options as string[]) ?? [],
      difficulty: c.difficulty as string,
      targetSeconds: target,
      contributorName: null,
      attempt: my ? {
        choice: Number(my.choice),
        isCorrect: my.is_correct === true,
        correctIndex: Number(c.correct_index),
        explanation: c.explanation as string,
        communityCorrectPct: st.total >= SPLIT_MIN_ATTEMPTS ? Math.round((st.correct / st.total) * 100) : null,
        attemptCount: st.total,
        coverageStatus: coverageByTopic.get(c.topic as string) ?? 'not_started',
        // The clock's result, so a student who already answered still sees
        // what the clock bought them. Same density gate as every other
        // community percentage — below it we show their own time only.
        yourSeconds,
        beatTheClock: yourSeconds == null ? null : yourSeconds <= target,
        inTimePct: st.timed >= SPLIT_MIN_ATTEMPTS ? Math.round((st.inTime / st.timed) * 100) : null,
      } : null,
    };
  });

  return NextResponse.json({ date, challenges: views });
}
