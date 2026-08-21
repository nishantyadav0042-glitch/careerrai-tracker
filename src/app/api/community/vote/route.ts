import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

// POST /api/community/vote — one student × one contribution = one CURRENT
// vote (founder ruling, 20 Aug). States: none / up / down. Every transition
// is legal and server-authoritative:
//   none→up, none→down, up→down, down→up  → upsert on the DB uniqueness
//   up→none, down→none                    → delete
// The DB constraint (submission_votes_once UNIQUE(student_id,submission_id))
// is the invariant; the upsert rides it, so two tabs / rapid taps / retries
// converge on one row. The response returns ok only after the DB write —
// the UI must never claim a vote the database rejected.
//
// Body: { submission_id, dir: 'up' | 'down' | null }. The legacy
// { helpful: boolean } body is still accepted (older clients in the deploy
// window) and maps to up/down.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { submission_id: sid, dir: rawDir, helpful } = body as {
    submission_id?: unknown; dir?: unknown; helpful?: unknown;
  };
  const dir: 'up' | 'down' | null | undefined =
    rawDir === 'up' || rawDir === 'down' || rawDir === null ? rawDir
    : typeof helpful === 'boolean' ? (helpful ? 'up' : 'down')
    : undefined;
  if (typeof sid !== 'string' || dir === undefined) {
    return NextResponse.json({ error: 'submission_id and dir (up/down/null) required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: sub, error: subErr } = await admin.from('student_submissions')
    .select('id, status, student_id').eq('id', sid).maybeSingle();
  // Hardening sprint (21 Aug): this read used to be unchecked, so a DB blip
  // answered "This one is no longer available" — infrastructure ERROR dressed
  // as a business FALSE, and the vote was discarded. UNKNOWN is retryable.
  if (subErr) {
    return NextResponse.json({ error: 'Could not save your vote right now — try again.', code: 'VOTE_UNAVAILABLE', retryable: true }, { status: 503 });
  }
  // A live item is votable FOREVER (20 Aug). The old rule also accepted
  // 'featured' and a 72h 'voting' window — and refused 'archived', which was
  // 77% of what the feed displayed: 5 of the first 8 cards answered a vote
  // with 400 and the vote vanished. Content is permanent; only the top
  // placement is one day.
  if (!sub || sub.status !== 'live') {
    return NextResponse.json({ error: 'This one is no longer available' }, { status: 400 });
  }
  // No self-votes — the one gaming vector this simple design has.
  if (sub.student_id === user.id) {
    return NextResponse.json({ error: 'You can’t vote on your own share' }, { status: 400 });
  }

  if (dir === null) {
    // Remove my vote. Deleting a row that isn't there is a no-op — idempotent.
    const { error } = await admin.from('submission_votes')
      .delete().eq('student_id', user.id).eq('submission_id', sid);
    if (error) return NextResponse.json({ error: 'Could not save' }, { status: 500 });
    return NextResponse.json({ ok: true, myVote: null });
  }

  // Set or switch. One statement on the uniqueness constraint — no
  // read-then-write, so concurrent taps serialize on the row.
  const { error } = await admin.from('submission_votes').upsert(
    { student_id: user.id, submission_id: sid, helpful: dir === 'up' },
    { onConflict: 'student_id,submission_id' },
  );
  if (error) return NextResponse.json({ error: 'Could not save' }, { status: 500 });

  return NextResponse.json({ ok: true, myVote: dir });
}
