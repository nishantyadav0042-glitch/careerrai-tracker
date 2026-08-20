import { requireAdminCtx as requireAdmin } from '@/lib/require-admin';
import { NextRequest, NextResponse } from 'next/server';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { activeChallengeDate } from '@/lib/challenge';
import { tallySubmission } from '@/lib/community-pipeline';

export const maxDuration = 30;

// Admin: the verification desk for the Daily Challenge.
//
// GET  — the challenge bank + today's status.
// POST — { action: 'create' | 'schedule' | 'review' | 'retire', ... }
//   create   — founder/admin adds a question straight to the bank
//   review   — approve/reject a student submission; approving a question
//              copies it into the bank with the student's credit attached;
//              approving a tip publishes it to its topic
//   schedule — set a bank question live on a date (one per section per day)
//   retire   — pull a question from rotation
//
// Verification is deliberately human — AI may format and flag, but whether a
// shortcut is mathematically sound is judged by a person (gemini.ts rule).


export async function GET() {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  const [{ data: bank }, { data: attemptsToday }, { data: votingRows }, { data: votes }] = await Promise.all([
    admin.from('daily_challenges')
      .select('id, live_date, section, topic, question, difficulty, source, status')
      .neq('status', 'rejected').order('live_date', { ascending: false, nullsFirst: true }).limit(60),
    admin.from('challenge_attempts').select('challenge_id, is_correct, daily_challenges:challenge_id(live_date)')
      .gte('created_at', new Date(Date.now() - 2 * 86_400_000).toISOString()),
    admin.from('student_submissions')
      .select('id, kind, topic, payload, display_name, image_path')
      .eq('status', 'live').order('created_at'),
    admin.from('submission_votes').select('submission_id, helpful'),
  ]);

  // The ranking the community is producing — admin-only; students never see
  // tallies. There is no bar and no verdict (founder, 29 Jul + 7 Aug): votes
  // only ORDER the Daily Pick queue, so this list is shown in that exact
  // order — total votes first, oldest first among equals (the rows arrive
  // created_at-ascending and the sort is stable), matching the founder
  // dashboard by construction.
  const tally = new Map<string, { yes: number; no: number }>();
  for (const v of votes ?? []) {
    const t = tally.get(v.submission_id as string) ?? { yes: 0, no: 0 };
    if (v.helpful) t.yes += 1; else t.no += 1;
    tally.set(v.submission_id as string, t);
  }
  const pipeline = (votingRows ?? []).map((r) => {
    const t = tally.get(r.id as string) ?? { yes: 0, no: 0 };
    const g = tallySubmission(t.yes, t.no);
    return {
      id: r.id, kind: r.kind, topic: r.topic,
      text: (r.payload as { text?: string } | null)?.text ?? null,
      hasImage: !!r.image_path,
      displayName: r.display_name,
      yes: t.yes, no: t.no, totalVotes: g.total, helpfulPct: g.helpfulPct,
    };
  }).sort((a, b) => b.totalVotes - a.totalVotes);

  return NextResponse.json({
    activeDate: activeChallengeDate(),
    bank: bank ?? [],
    pipeline,
    recentAttempts: (attemptsToday ?? []).length,
  });
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin, userId } = ctx;
  const body = await request.json().catch(() => ({}));
  const action = body.action as string;

  if (action === 'create') {
    const { section, topic, question, options, correct_index: ci, difficulty, explanation } = body;
    if (!['QA', 'DILR', 'VARC'].includes(section)) return NextResponse.json({ error: 'Bad section' }, { status: 400 });
    if (!TOPIC_METADATA[topic] || TOPIC_METADATA[topic].section !== section) {
      return NextResponse.json({ error: 'Topic must be canonical and in that section' }, { status: 400 });
    }
    if (typeof question !== 'string' || !Array.isArray(options) || options.length < 2 || options.length > 6
        || !Number.isInteger(ci) || ci < 0 || ci >= options.length || typeof explanation !== 'string') {
      return NextResponse.json({ error: 'Incomplete question' }, { status: 400 });
    }
    const { data, error } = await admin.from('daily_challenges').insert({
      section, topic, question, options, correct_index: ci,
      difficulty: ['easy', 'medium', 'hard', 'timed'].includes(difficulty) ? difficulty : 'medium',
      explanation, source: 'careerrai', status: 'approved',
    }).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  // The Gen-1 submission review path was removed 20 Aug. It read
  // student_submissions where status='pending' and promoted them into
  // daily_challenges by reading payload.options — an MCQ shape the live
  // submission path has never written. Zero rows ever went through it, and
  // after the live-pool migration 'pending' means something else entirely
  // (a safety hold), so this screen would have offered an Approve button
  // that could only fail. Safety holds are reviewed on /admin/daily-pick.

  if (action === 'schedule') {
    const { challenge_id: cid, live_date: liveDate } = body as { challenge_id?: string; live_date?: string };
    if (!cid || !liveDate || !/^\d{4}-\d{2}-\d{2}$/.test(liveDate)) {
      return NextResponse.json({ error: 'challenge_id and live_date required' }, { status: 400 });
    }
    const { error } = await admin.from('daily_challenges')
      .update({ live_date: liveDate, status: 'live' }).eq('id', cid).in('status', ['approved', 'live']);
    if (error) {
      // Unique index: one challenge per section per day.
      const clash = error.code === '23505';
      return NextResponse.json({ error: clash ? 'That day already has a challenge for this section' : error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'retire') {
    const { challenge_id: cid } = body as { challenge_id?: string };
    if (!cid) return NextResponse.json({ error: 'challenge_id required' }, { status: 400 });
    await admin.from('daily_challenges').update({ status: 'retired' }).eq('id', cid);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
