import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { emitPaymentFunnel, isPaymentFunnelEvent } from '@/lib/payment-funnel';

// Client beacon for the payment funnel stages the server cannot see: the
// Razorpay modal opening, and the student closing it.
//
// Authenticated, and the student_id comes from the SESSION — never from the
// body. A funnel that anyone can write to is a funnel that tells you nothing.
export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { event, plan, orderId, surface, reason } = (await request.json().catch(() => ({}))) ?? {};
  if (!isPaymentFunnelEvent(event)) return NextResponse.json({ error: 'Unknown event' }, { status: 400 });

  const admin = createAdminClient();
  await emitPaymentFunnel(admin, user.id, event, {
    ...(typeof plan === 'string' ? { plan: plan.slice(0, 40) } : {}),
    ...(typeof orderId === 'string' ? { order_id: orderId.slice(0, 80) } : {}),
    ...(typeof surface === 'string' ? { surface: surface.slice(0, 40) } : {}),
    ...(typeof reason === 'string' ? { reason: reason.slice(0, 120) } : {}),
  });
  return NextResponse.json({ ok: true });
}
