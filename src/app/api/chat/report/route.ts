import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidReportReason, MAX_REPORT_NOTE } from '@/lib/chat-safety';

export const maxDuration = 30;

// POST /api/chat/report — the report/block action required of any app with
// user-generated content (App Store 1.2, Play UGC policy).
//
// Body: { reason, note?, block?, otherId }
//
// A block is stored separately from the report because the two are independent:
// a student may block without filing a reason, or report without wanting to cut
// the line. Both are honoured.
//
// The block is enforced in BOTH directions by the send route — a one-way block
// that still lets the reported person talk is not a block.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { reason, note, block, otherId } = body as {
    reason?: unknown; note?: unknown; block?: unknown; otherId?: unknown;
  };

  if (typeof otherId !== 'string' || !otherId) {
    return NextResponse.json({ error: 'otherId required' }, { status: 400 });
  }
  if (otherId === user.id) {
    return NextResponse.json({ error: 'You cannot report yourself' }, { status: 400 });
  }
  if (!isValidReportReason(reason)) {
    return NextResponse.json({ error: 'A valid reason is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Only report someone you actually have a thread with. Without this the
  // endpoint files reports against arbitrary user ids.
  //
  // Two plain .in() reads plus a JS comparison, NOT a nested PostgREST
  // or(and(...)). This codebase already made that call twice for the Daily Pick
  // shelf, and the reasoning is stronger here: a filter no test can exercise is
  // deciding who is allowed to report whom.
  const pair = [user.id, otherId];
  const [{ data: profileRows }, { data: msgRows }] = await Promise.all([
    admin.from('profiles').select('id, buddy_id').in('id', pair),
    admin.from('chat_messages').select('student_id, buddy_id').in('student_id', pair).in('buddy_id', pair).limit(1),
  ]);
  const me = (profileRows ?? []).find((r) => r.id === user.id);
  const them = (profileRows ?? []).find((r) => r.id === otherId);
  const paired = me?.buddy_id === otherId || them?.buddy_id === user.id;
  const hasThread = (msgRows ?? []).length > 0;
  if (!paired && !hasThread) {
    return NextResponse.json({ error: 'No conversation with that person' }, { status: 403 });
  }

  const cleanNote = typeof note === 'string' && note.trim()
    ? note.trim().slice(0, MAX_REPORT_NOTE)
    : null;
  const wantsBlock = block === true;

  const { error: reportError } = await admin.from('chat_reports').insert({
    reporter_id: user.id,
    reported_id: otherId,
    reason,
    note: cleanNote,
    blocked: wantsBlock,
  });
  if (reportError) {
    console.error('[chat/report] insert failed', reportError.message);
    return NextResponse.json({ error: 'Could not file that report — please email business@careerrai.com.' }, { status: 500 });
  }

  if (wantsBlock) {
    // Unique on (blocker, blocked): a repeat block is already the desired state,
    // so a duplicate-key error is success, not a failure to surface.
    const { error: blockError } = await admin.from('chat_blocks').insert({
      blocker_id: user.id, blocked_id: otherId,
    });
    if (blockError && blockError.code !== '23505') {
      console.error('[chat/report] block failed', blockError.message);
      return NextResponse.json({ error: 'Reported, but the block did not save. Please email business@careerrai.com.' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, blocked: wantsBlock });
}
