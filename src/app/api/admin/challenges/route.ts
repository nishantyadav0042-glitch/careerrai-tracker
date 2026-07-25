import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { activeChallengeDate } from '@/lib/challenge';

export const maxDuration = 30;

// Admin: the verification desk for the Daily Challenge.
//
// GET  — pending student submissions + the challenge bank + today's status.
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

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { admin, userId: user.id };
}

export async function GET() {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  const [{ data: pending }, { data: bank }, { data: attemptsToday }, { data: votingRows }, { data: votes }] = await Promise.all([
    admin.from('student_submissions')
      .select('id, student_id, kind, topic, payload, created_at, profiles:student_id(full_name)')
      .eq('status', 'pending').order('created_at'),
    admin.from('daily_challenges')
      .select('id, live_date, section, topic, question, difficulty, source, status')
      .neq('status', 'rejected').order('live_date', { ascending: false, nullsFirst: true }).limit(60),
    admin.from('challenge_attempts').select('challenge_id, is_correct, daily_challenges:challenge_id(live_date)')
      .gte('created_at', new Date(Date.now() - 2 * 86_400_000).toISOString()),
    admin.from('student_submissions')
      .select('id, kind, topic, payload, display_name, image_path, voting_ends_at')
      .eq('status', 'voting').order('created_at'),
    admin.from('submission_votes').select('submission_id, helpful'),
  ]);

  // The ranking the community is producing — admin-only; students never see
  // tallies. This is what decides which items graduate to featured.
  const tally = new Map<string, { yes: number; no: number }>();
  for (const v of votes ?? []) {
    const t = tally.get(v.submission_id as string) ?? { yes: 0, no: 0 };
    if (v.helpful) t.yes += 1; else t.no += 1;
    tally.set(v.submission_id as string, t);
  }
  const pipeline = (votingRows ?? []).map((r) => ({
    id: r.id, kind: r.kind, topic: r.topic,
    text: (r.payload as { text?: string } | null)?.text ?? null,
    hasImage: !!r.image_path,
    displayName: r.display_name,
    votingEndsAt: r.voting_ends_at,
    ...(tally.get(r.id as string) ?? { yes: 0, no: 0 }),
  })).sort((a, b) => (b.yes - b.no) - (a.yes - a.no));

  return NextResponse.json({
    activeDate: activeChallengeDate(),
    pending: pending ?? [],
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

  if (action === 'review') {
    const { submission_id: sid, decision } = body as { submission_id?: string; decision?: string };
    if (!sid || (decision !== 'approve' && decision !== 'reject')) {
      return NextResponse.json({ error: 'submission_id and decision required' }, { status: 400 });
    }
    const { data: sub } = await admin.from('student_submissions')
      .select('id, student_id, kind, topic, payload, status').eq('id', sid).maybeSingle();
    if (!sub || sub.status !== 'pending') return NextResponse.json({ error: 'Not pending' }, { status: 400 });

    const now = new Date().toISOString();
    if (decision === 'reject') {
      await admin.from('student_submissions')
        .update({ status: 'rejected', reviewed_by: userId, reviewed_at: now }).eq('id', sid);
      return NextResponse.json({ ok: true });
    }

    if (sub.kind === 'question') {
      // Approved question graduates into the bank WITH the student's credit —
      // the credit is the reward, and it survives into the daily drop.
      const p = sub.payload as { question: string; options: string[]; correct_index: number; explanation: string };
      const meta = TOPIC_METADATA[sub.topic as string];
      if (!meta) return NextResponse.json({ error: 'Submission topic no longer canonical' }, { status: 400 });
      const { error } = await admin.from('daily_challenges').insert({
        section: meta.section, topic: sub.topic,
        question: p.question, options: p.options, correct_index: p.correct_index,
        explanation: p.explanation, difficulty: 'medium',
        source: 'student', contributor_id: sub.student_id, status: 'approved',
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await admin.from('student_submissions').update({
      status: 'approved', reviewed_by: userId, reviewed_at: now,
      // Tips, mistakes and shortcuts publish the moment they're approved —
      // straight into their topic's curriculum. Questions publish when their
      // bank entry is scheduled live.
      published_at: sub.kind !== 'question' ? now : null,
    }).eq('id', sid);
    return NextResponse.json({ ok: true });
  }

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
