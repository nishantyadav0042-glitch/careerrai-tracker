import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentsEnabled } from '@/lib/feature-flags';

// Honors the no-questions money-back guarantee by FLAGGING admin. The actual
// refund is processed manually in the Razorpay dashboard — never automated.
export async function POST() {
  if (!paymentsEnabled()) return NextResponse.json({ error: 'Payments are not enabled.' }, { status: 403 });
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, subscription_status')
      .eq('id', user.id)
      .single();
    if (profile?.subscription_status !== 'active') {
      return NextResponse.json({ error: 'No active membership to refund.' }, { status: 400 });
    }

    await admin.from('profiles').update({ subscription_status: 'refund_requested' }).eq('id', user.id);

    const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
    if (admins?.length) {
      await admin.from('notifications').insert(
        admins.map((a) => ({
          user_id: a.id,
          type: 'refund_request',
          title: `${profile?.full_name ?? 'A student'} requested a refund`,
          body: 'Process it in the Razorpay dashboard, then update their membership status.',
          read: false,
          channel: 'in_app',
        }))
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[refund]', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
