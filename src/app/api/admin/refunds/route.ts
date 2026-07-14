import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revokePremium } from '@/lib/premium';

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

  // If approved, actually revoke access — the paywall gates on `is_premium`,
  // not `subscription_status` (bug audit, 14 July: an approved refund only
  // ever updated subscription_status, leaving is_premium=true — refunded
  // students kept the buddy/chat/debrief they were refunded for, and their
  // buddy_assignment_queue row stayed 'pending' forever).
  if (action === 'approve') {
    await admin.from('profiles').update({ subscription_status: 'expired' }).eq('id', student_id);
    await revokePremium(admin, student_id);
  } else {
    // Rejected — revert to active (only meaningful if they were actually
    // premium; revokePremium is not called here since nothing was revoked).
    await admin.from('profiles').update({ subscription_status: 'active' }).eq('id', student_id);
  }

  // NOTE: this route only updates our own records. The actual money
  // movement back to the student's card/UPI must still be issued from the
  // Razorpay dashboard (Transactions → Payments → Refund) — that API call
  // is not wired here yet. Do it manually until it's automated.
  return NextResponse.json({ ok: true });
}
