import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Log a sales touch: records the current lead state (status + scheduled
// callback) AND appends a permanent activity row, so every call, note and
// outcome is history that never gets overwritten. Allowed for admin and sales.
export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role, email, full_name').eq('id', user.id).single();
  if (me?.role !== 'admin' && me?.role !== 'sales') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { studentId, status, note, callbackAt } = body ?? {};
  const VALID = ['called', 'interested', 'follow_up', 'converted', 'not_interested', 'no_answer'];
  if (typeof studentId !== 'string' || (status != null && !VALID.includes(status))) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const cb = typeof callbackAt === 'string' && callbackAt ? new Date(callbackAt).toISOString() : null;
  const noteText = typeof note === 'string' && note.trim() ? note.trim().slice(0, 2000) : null;
  const actor = (me?.email as string | null) ?? (me?.full_name as string | null) ?? 'sales';

  // Current state (upsert) — feeds prioritization + the callbacks-due queue.
  await admin.from('lead_outreach').upsert({
    student_id: studentId,
    status: status ?? 'called',
    callback_at: cb,
    next_follow_up: status === 'follow_up' && cb ? cb.slice(0, 10) : null,
    notes: noteText,
    owner: actor,
    updated_at: new Date().toISOString(),
  });

  // Permanent history — append-only.
  await admin.from('sales_activity').insert({
    student_id: studentId, actor, status: status ?? 'called', note: noteText, callback_at: cb,
  });

  return NextResponse.json({ ok: true });
}
