import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { admin };
}

// Set a buddy's agreed monthly payout. Buddies never see a number until the
// founder sets it here, so this is the single source of the amount.
export async function PATCH(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  try {
    const { buddy_id, agreed_monthly_payout } = (await request.json()) as {
      buddy_id?: string; agreed_monthly_payout?: number | null;
    };
    if (!buddy_id) return NextResponse.json({ error: 'buddy_id required' }, { status: 400 });
    const amount =
      agreed_monthly_payout === null || agreed_monthly_payout === undefined
        ? null
        : Math.max(0, Math.round(Number(agreed_monthly_payout)));
    if (amount !== null && !Number.isFinite(amount)) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    await admin.from('profiles').update({ agreed_monthly_payout: amount }).eq('id', buddy_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[payouts] PATCH', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

// Mark a buddy paid for a period. This is a RECORD of a manual UPI/bank transfer
// the founder already made — it never moves money.
export async function POST(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  try {
    const { buddy_id, period, payment_ref } = (await request.json()) as {
      buddy_id?: string; period?: string; payment_ref?: string;
    };
    if (!buddy_id || !period) return NextResponse.json({ error: 'buddy_id and period required' }, { status: 400 });

    // Snapshot the agreed amount + active student count at time of payment.
    const { data: buddy } = await admin
      .from('profiles')
      .select('agreed_monthly_payout')
      .eq('id', buddy_id)
      .single();
    if (buddy?.agreed_monthly_payout == null) {
      return NextResponse.json({ error: 'Set this buddy’s agreed payout first.' }, { status: 400 });
    }
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('buddy_id', buddy_id)
      .eq('role', 'student');

    const { error } = await admin
      .from('buddy_payouts')
      .upsert(
        {
          buddy_id,
          period,
          agreed_amount: buddy.agreed_monthly_payout,
          active_student_count: count ?? 0,
          status: 'paid',
          paid_date: new Date().toISOString().slice(0, 10),
          payment_ref: payment_ref?.trim() || null,
        },
        { onConflict: 'buddy_id,period' }
      );
    if (error) {
      console.error('[payouts] upsert', error);
      return NextResponse.json({ error: 'Could not record payout.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[payouts] POST', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
