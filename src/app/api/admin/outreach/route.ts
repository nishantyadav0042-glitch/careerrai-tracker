import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

const VALID_STATUS = ['not_contacted', 'called', 'interested', 'follow_up', 'converted', 'not_interested'];

// Upsert a lead's outreach state (owner / status / follow-up / notes).
// Admin-only: lead_outreach has RLS with no policies, so only this
// service-role path can touch it — students can never read the sales
// team's notes about them.
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
  const { student_id, owner, status, next_follow_up, notes } = body ?? {};
  if (typeof student_id !== 'string' || !student_id) {
    return NextResponse.json({ error: 'student_id required' }, { status: 400 });
  }
  if (status != null && !VALID_STATUS.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  if (next_follow_up != null && !/^\d{4}-\d{2}-\d{2}$/.test(next_follow_up)) {
    return NextResponse.json({ error: 'Invalid follow-up date' }, { status: 400 });
  }

  const { error } = await admin.from('lead_outreach').upsert({
    student_id,
    owner: typeof owner === 'string' && owner.trim() ? owner.trim().slice(0, 100) : null,
    status: status ?? 'not_contacted',
    next_follow_up: next_follow_up ?? null,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 2000) : null,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
