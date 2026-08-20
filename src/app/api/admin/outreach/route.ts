import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { LEAD_STATUSES, nextActionAtFromDate } from '@/lib/sales-disposition';

// One vocabulary, one authority: the same list the DB CHECK enforces.
const VALID_STATUS: readonly string[] = LEAD_STATUSES;

// Upsert a lead's outreach state (owner / status / follow-up / notes).
// Admin-only: lead_outreach has RLS with no policies, so only this
// service-role path can touch it — students can never read the sales
// team's notes about them.
//
// ONE CLOCK (SA-1A, 20 Aug 2026): the admin's follow-up date is written to
// next_action_at — the SAME column the rep's disposition engine writes and
// the call queue reads. The date
// maps to 11:00 IST via the one cadence model in lib/sales-disposition.
export async function PATCH(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  // SA-1D: `owner` is no longer accepted here. Ownership is written only by
  // the atomic claim (claim_lead RPC, via /api/sales/log) and the admin
  // reassign route — free-text ownership was the race we removed.
  const { student_id, status, nextActionDate, notes } = body ?? {};
  const followDate = nextActionDate;
  if (typeof student_id !== 'string' || !student_id) {
    return NextResponse.json({ error: 'student_id required' }, { status: 400 });
  }
  if (status != null && !VALID_STATUS.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  if (followDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(followDate)) {
    return NextResponse.json({ error: 'Invalid follow-up date' }, { status: 400 });
  }

  const { error } = await admin.from('lead_outreach').upsert({
    student_id,
    status: status ?? 'not_contacted',
    next_action_at: followDate ? nextActionAtFromDate(followDate) : null,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 2000) : null,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// Tonight's Mission: record a founder outreach action (sent / skipped /
// snoozed) so the queue never resurfaces a student the founder handled.
export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { studentId, objective, action, message, snoozeHours } = body ?? {};
  if (typeof studentId !== 'string' || !['sent', 'skipped', 'snoozed'].includes(action)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const snoozed_until = action === 'snoozed'
    ? new Date(Date.now() + (Number(snoozeHours) || 24) * 3600_000).toISOString()
    : null;

  const { error } = await admin.from('founder_outreach').insert({
    student_id: studentId,
    objective: typeof objective === 'string' ? objective : 'log',
    action,
    message: typeof message === 'string' ? message : null,
    snoozed_until,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
