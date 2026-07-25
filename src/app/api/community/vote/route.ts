import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

// POST /api/community/vote — one curriculum judgement: should future students
// see this? One vote per student per item, first vote stands, and the
// response deliberately returns NO tallies — a voter who sees the score
// stops judging the content and starts joining the crowd.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { submission_id: sid, helpful } = body as { submission_id?: unknown; helpful?: unknown };
  if (typeof sid !== 'string' || typeof helpful !== 'boolean') {
    return NextResponse.json({ error: 'submission_id and helpful required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: sub } = await admin.from('student_submissions')
    .select('id, status, voting_ends_at, student_id').eq('id', sid).maybeSingle();
  if (!sub || sub.status !== 'voting' || (sub.voting_ends_at && sub.voting_ends_at < new Date().toISOString())) {
    return NextResponse.json({ error: 'Voting is closed for this one' }, { status: 400 });
  }
  // No self-votes — the one gaming vector this simple design has.
  if (sub.student_id === user.id) {
    return NextResponse.json({ error: 'You can’t vote on your own share' }, { status: 400 });
  }

  const { error } = await admin.from('submission_votes').insert({
    student_id: user.id, submission_id: sid, helpful,
  });
  if (error) {
    const already = error.code === '23505';
    return NextResponse.json({ error: already ? 'Already voted' : 'Could not save' }, { status: already ? 409 : 500 });
  }

  return NextResponse.json({ ok: true });
}
