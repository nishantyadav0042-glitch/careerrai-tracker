import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { MAX_SUBMISSIONS_PER_DAY } from '@/lib/challenge';

export const maxDuration = 30;

// POST /api/community/submit — "Help your friend": share a tricky question or
// a tip. For the students, by the students — with a truth filter.
//
// NOTHING submitted here reaches another student directly. Every item lands
// in a verification queue (status 'pending') and is published only after a
// human approves it — because the researched failure of every CAT Telegram
// group is unverified advice at scale, and the filter IS our differentiator.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { kind, topic, tip, question, options, correct_index: correctIndex, explanation } = body as {
    kind?: unknown; topic?: unknown; tip?: unknown; question?: unknown;
    options?: unknown; correct_index?: unknown; explanation?: unknown;
  };

  if (kind !== 'question' && kind !== 'tip') {
    return NextResponse.json({ error: 'kind must be question or tip' }, { status: 400 });
  }
  // Topic must be canonical — community content binds to the same taxonomy as
  // everything else, or tips can never surface on the right plan page.
  if (typeof topic !== 'string' || !TOPIC_METADATA[topic]) {
    return NextResponse.json({ error: 'Pick the topic this belongs to' }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  if (kind === 'tip') {
    const text = typeof tip === 'string' ? tip.trim() : '';
    if (text.length < 20 || text.length > 600) {
      return NextResponse.json({ error: 'Tip should be 20–600 characters' }, { status: 400 });
    }
    payload = { text };
  } else {
    const q = typeof question === 'string' ? question.trim() : '';
    const opts = Array.isArray(options)
      ? options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).map((o) => o.trim())
      : [];
    const ci = Math.floor(Number(correctIndex));
    const expl = typeof explanation === 'string' ? explanation.trim() : '';
    if (q.length < 20 || q.length > 2000) return NextResponse.json({ error: 'Question should be 20–2000 characters' }, { status: 400 });
    if (opts.length < 2 || opts.length > 6) return NextResponse.json({ error: 'Give 2–6 options' }, { status: 400 });
    if (!Number.isFinite(ci) || ci < 0 || ci >= opts.length) return NextResponse.json({ error: 'Mark which option is correct' }, { status: 400 });
    if (expl.length < 10 || expl.length > 2000) return NextResponse.json({ error: 'Explain the answer — that is what makes it worth sharing' }, { status: 400 });
    payload = { question: q, options: opts, correct_index: ci, explanation: expl };
  }

  const admin = createAdminClient();

  // Rate limit: quality over volume, and a spam wall for the review queue.
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin
    .from('student_submissions').select('id', { count: 'exact', head: true })
    .eq('student_id', user.id).gte('created_at', dayAgo);
  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_DAY) {
    return NextResponse.json({ error: `Max ${MAX_SUBMISSIONS_PER_DAY} shares a day — quality over quantity` }, { status: 429 });
  }

  const { error } = await admin.from('student_submissions').insert({
    student_id: user.id, kind, topic, payload,
  });
  if (error) {
    console.error('[community] submit failed', error.message);
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Sent for review. If approved, it goes out to the whole community with your name on it.',
  });
}
