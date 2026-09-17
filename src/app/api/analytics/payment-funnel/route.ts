import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { emitPaymentFunnel, isPaymentFunnelEvent, FUNNEL_ORDER_KEY } from '@/lib/payment-funnel';

// Client beacon for the payment funnel stages the server cannot see: the
// Razorpay modal opening, and the student closing it.
//
// Authenticated, and the student_id comes from the SESSION — never from the
// body. A funnel that anyone can write to is a funnel that tells you nothing.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) ?? {};
  const { event, plan, orderId, surface } = body;
  if (!isPaymentFunnelEvent(event)) return NextResponse.json({ error: 'Unknown event' }, { status: 400 });

  // Razorpay's own account of a failed attempt. The allow-list used to forward
  // `reason` alone, so `code`, `description`, `source`, `step` and `paymentId`
  // were computed by checkoutFailureProps and then silently dropped here —
  // which made "we preserve what Razorpay said" false for five of its six
  // fields. Bounded the same way as everything else, never interpreted.
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? { value: v.slice(0, max) } : null);
  const failure: Record<string, string> = {};
  for (const [k, max] of [['code', 80], ['description', 200], ['source', 40], ['step', 40], ['reason', 120], ['paymentId', 80]] as const) {
    const f = str((body as Record<string, unknown>)[k], max);
    if (f) failure[k] = f.value;
  }

  const admin = createAdminClient();
  await emitPaymentFunnel(admin, user.id, event, {
    ...(typeof plan === 'string' ? { plan: plan.slice(0, 40) } : {}),
    ...(typeof orderId === 'string' ? { [FUNNEL_ORDER_KEY]: orderId.slice(0, 80) } : {}),
    ...(typeof surface === 'string' ? { surface: surface.slice(0, 40) } : {}),
    ...failure,
  });
  return NextResponse.json({ ok: true });
}
