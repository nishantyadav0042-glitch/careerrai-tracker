import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { student_id, action, notes } = (await request.json()) as {
    student_id: string;
    action: 'approve' | 'reject';
    notes?: string;
  };
  if (!student_id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  await admin
    .from('refund_requests')
    .update({ status: action === 'approve' ? 'approved' : 'rejected', admin_notes: notes ?? null, resolved_at: new Date().toISOString() })
    .eq('student_id', student_id);

  // If approved, update subscription status to expired
  if (action === 'approve') {
    await admin.from('profiles').update({ subscription_status: 'expired' }).eq('id', student_id);
  } else {
    // Rejected — revert to active
    await admin.from('profiles').update({ subscription_status: 'active' }).eq('id', student_id);
  }

  return NextResponse.json({ ok: true });
}
