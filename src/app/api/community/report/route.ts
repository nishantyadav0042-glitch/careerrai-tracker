import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

// POST /api/community/report — the Play-UGC-required "this shouldn't be here"
// button. One report per student per item. At 3 distinct reports the item is
// automatically pulled from the voting pool (status → 'pending', which lands
// it in the founder's existing review queue) — automated protection, human
// final call. Reports are never shown to other students; there is no public
// counter to brigade.

const REASONS = ['wrong_or_misleading', 'abusive', 'spam_or_ad', 'not_cat', 'other'];
const AUTO_PULL_AT = 3;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { submission_id: sid, reason } = body as { submission_id?: unknown; reason?: unknown };
  if (typeof sid !== 'string' || typeof reason !== 'string' || !REASONS.includes(reason)) {
    return NextResponse.json({ error: 'submission_id and a valid reason required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: sub } = await admin.from('student_submissions')
    .select('id, status').eq('id', sid).maybeSingle();
  // Live items are the reportable ones. This read 'voting'/'featured' until
  // 20 Aug — statuses the live-pool migration retired — so EVERY report
  // returned 400 and the Play-required "this shouldn't be here" button was
  // dead on every card in the feed.
  if (!sub || sub.status !== 'live') {
    return NextResponse.json({ error: 'Nothing to report here' }, { status: 400 });
  }

  const { error } = await admin.from('community_reports').insert({
    student_id: user.id, submission_id: sid, reason,
  });
  if (error) {
    const already = error.code === '23505';
    // "Already reported" still reads as success to the student — the goal is
    // that the concern is registered, not that they learn our dedup rules.
    if (!already) return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }

  const { count } = await admin.from('community_reports')
    .select('id', { count: 'exact', head: true }).eq('submission_id', sid);
  if ((count ?? 0) >= AUTO_PULL_AT && sub.status === 'live') {
    await admin.from('student_submissions').update({ status: 'pending' }).eq('id', sid);
  }

  return NextResponse.json({ ok: true });
}
