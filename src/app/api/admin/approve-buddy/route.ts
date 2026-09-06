import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/integration-audit';

export const dynamic = 'force-dynamic';

// ── APPROVE (OR REVOKE) A MENTOR FOR STUDENT VISIBILITY ────────────────────
//
// Until 5 Sep 2026 a buddy became recommendable to students by finishing their
// OWN onboarding form — the same form in which they type their percentile,
// their IIM and their employer. Nobody checked any of it, and three separate
// hand-outs read that state: the "Top buddies for you" showcase, mentor-doors
// auto-assignment, and paid-session assignment (the last of which did not even
// exclude test accounts).
//
// Incident #66 showed the path was reachable by accident: a phone-OTP fork
// arrived already carrying role='buddy', one completed wizard away from a
// student's mentor list.
//
// So visibility is now an explicit human act, recorded with a timestamp and an
// approver. TRUST-OS: never hand out what you cannot verify.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { buddy_id?: unknown; approved?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const buddyId = typeof body.buddy_id === 'string' ? body.buddy_id : '';
  if (!buddyId) return NextResponse.json({ error: 'Missing buddy_id' }, { status: 400 });
  // Explicit boolean only. A missing/garbled field must never be read as
  // "approve" — the whole point of this route is that approval is deliberate.
  if (typeof body.approved !== 'boolean') {
    return NextResponse.json({ error: 'Missing approved (true|false).' }, { status: 400 });
  }
  const approving = body.approved;

  // Never let this write approval onto a student or admin profile.
  const { data: target } = await admin
    .from('profiles').select('role, full_name, buddy_approved_at').eq('id', buddyId).single();
  if (target?.role !== 'buddy') return NextResponse.json({ error: 'Not a mentor.' }, { status: 400 });

  const { error } = await admin
    .from('profiles')
    .update({
      buddy_approved_at: approving ? new Date().toISOString() : null,
      buddy_approved_by: approving ? user.id : null,
    })
    .eq('id', buddyId);
  if (error) {
    console.error('[approve-buddy] update failed:', error.message);
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  }

  // Revoking is the consequential direction: students already assigned to this
  // mentor KEEP their mentor (we never orphan a student mid-relationship), but
  // the mentor stops being showcased or newly assigned. Recorded either way.
  await audit({
    subjectId: buddyId,
    actorId: user.id,
    action: approving ? 'buddy.approved' : 'buddy.approval_revoked',
    detail: { name: target.full_name, wasApproved: target.buddy_approved_at !== null },
  });

  return NextResponse.json({ ok: true, approved: approving });
}
