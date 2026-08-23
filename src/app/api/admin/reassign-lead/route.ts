import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// SA-1D: the ONE way ownership moves between people. Reassignment is an
// intentional, admin-only action — never a side effect of saving a form —
// and it always leaves history: a 'reassigned' row in sales_activity, so
// "who worked this lead, and when did it change hands" survives forever.
//
// The new owner is a CANONICAL rep record (a profiles row with the sales or
// admin role), addressed by id and resolved server-side to their email —
// free-text ownership is exactly the drift this phase removed.
export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role, email').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { studentId, newOwnerId } = body ?? {};
  if (typeof studentId !== 'string' || !studentId || typeof newOwnerId !== 'string' || !newOwnerId) {
    return NextResponse.json({ error: 'studentId and newOwnerId are required' }, { status: 400 });
  }

  // The target must be a real rep — a canonical record, not a typed name.
  // R3 (23 Aug): the target must be a real staff record, addressed by id. The
  // previous version ALSO required `target.email` — which meant the founder's
  // own account, which has no email, could never be assigned a lead. Ownership
  // no longer depends on a column that is allowed to be null.
  const { data: target } = await admin
    .from('profiles').select('id, email, role').eq('id', newOwnerId).single();
  if (!target || (target.role !== 'sales' && target.role !== 'admin')) {
    return NextResponse.json({ error: 'New owner must be a sales or admin account.' }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Admin override is unconditional by design — that is what reassignment IS.
  const { error: stateError } = await admin.from('lead_outreach').upsert({
    student_id: studentId,
    owner: target.id,
    updated_at: now,
  });
  if (stateError) {
    console.error('[reassign-lead] lead_outreach upsert failed:', stateError.message);
    return NextResponse.json({ error: 'Could not reassign — try again.' }, { status: 500 });
  }

  const actor = user.id;
  const { error: historyError } = await admin.from('sales_activity').insert({
    student_id: studentId,
    actor,
    status: 'reassigned',
    note: `Reassigned to ${target.id}`,
  });
  if (historyError) {
    console.error('[reassign-lead] sales_activity insert failed:', historyError.message);
    return NextResponse.json({ error: 'Owner changed but history write failed — retry to record it.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, owner: target.id });
}
