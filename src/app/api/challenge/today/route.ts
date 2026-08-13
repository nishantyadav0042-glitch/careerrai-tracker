import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { activeChallengeDate, SPLIT_MIN_ATTEMPTS, TARGET_SECONDS, type ChallengeView } from '@/lib/challenge';

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
  const contributorIds = [...new Set(challenges.map((c) => c.contributor_id as string | null).filter((v): v is string => !!v))];
  const [{ data: myAttempts }, { data: allAttempts }, { data: coverage }, { data: contributors }] = await Promise.all([
    admin.from('challenge_attempts').select('challenge_id, choice, is_correct, seconds_taken')
      .eq('student_id', user.id).in('challenge_id', ids),
    admin.from('challenge_attempts').select('challenge_id, is_correct, seconds_taken').in('challenge_id', ids),
    admin.from('topic_coverage').select('topic, status').eq('student_id', user.id)
      .in('topic', challenges.map((c) => c.topic as string)),
    contributorIds.length
      ? admin.from('profiles').select('id, full_name').in('id', contributorIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);

  // ── The byline is EARNED, never invented ──────────────────────────────────
  //
  // This route used to hand back the literal string "a CareerRai student" for
  // every contributed question. Founder, 13 Aug: "don't mention the name of
  // CareerRai under questions — if a student submits then only their name
  // should be there, otherwise just mention the topic and Section."
  //
  // Signing a student's work with our own name takes half the credit for
  // something we did not write, and pads a thin feed with a byline nobody
  // asked for. A real contributor gets their real name; everything else gets
  // no byline at all and stands on its section and topic, which the card
  // already shows.
  const isCuratedName = (n: string | null | undefined) =>
    !n || !n.trim() || n.trim().toLowerCase() === 'careerrai';
  const nameById = new Map(
    (contributors ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name])
  );

  const mine = new Map((myAttempts ?? []).map((a) => [a.challenge_id as string, a]));
  const coverageByTopic = new Map((coverage ?? []).map((c) => [c.topic as string, (c.status as string) ?? 'not_started']));

  // Correctness and the clock, tallied together — the card's finished state
  // reports both, and reporting them from two different reads is how they
  // start disagreeing.
  const stats = new Map<string, { total: number; correct: number; timed: number; inTime: number }>();
  for (const a of allAttempts ?? []) {
    const s = stats.get(a.challenge_id as string) ?? { total: 0, correct: 0, timed: 0, inTime: 0 };
    s.total += 1;
    if (a.is_correct) s.correct += 1;
    if (typeof a.seconds_taken === 'number') {
      s.timed += 1;
      if ((a.seconds_taken as number) <= TARGET_SECONDS) s.inTime += 1;
    }
    stats.set(a.challenge_id as string, s);
  }

  const views: ChallengeView[] = challenges.map((c) => {
    const my = mine.get(c.id as string);
    const st = stats.get(c.id as string) ?? { total: 0, correct: 0, timed: 0, inTime: 0 };
    const contributed = c.contributor_id ? nameById.get(c.contributor_id as string) : null;
    const yourSeconds = typeof my?.seconds_taken === 'number' ? (my.seconds_taken as number) : null;
    return {
      id: c.id as string,
      section: c.section as string,
      topic: c.topic as string,
      question: c.question as string,
      options: (c.options as string[]) ?? [],
      difficulty: c.difficulty as string,
      contributorName: isCuratedName(contributed) ? null : (contributed as string),
      attempt: my ? {
        choice: Number(my.choice),
        isCorrect: my.is_correct === true,
        correctIndex: Number(c.correct_index),
        explanation: c.explanation as string,
        communityCorrectPct: st.total >= SPLIT_MIN_ATTEMPTS ? Math.round((st.correct / st.total) * 100) : null,
        attemptCount: st.total,
        coverageStatus: coverageByTopic.get(c.topic as string) ?? 'not_started',
        // The clock's result, so a student who already answered still sees
        // what the 90 seconds bought them. Same density gate as every other
        // community percentage — below it we show their own time only.
        yourSeconds,
        beatTheClock: yourSeconds == null ? null : yourSeconds <= TARGET_SECONDS,
        inTimePct: st.timed >= SPLIT_MIN_ATTEMPTS ? Math.round((st.inTime / st.timed) * 100) : null,
      } : null,
    };
  });

  return NextResponse.json({ date, challenges: views });
}
