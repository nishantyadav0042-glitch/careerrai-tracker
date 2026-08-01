import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp } from '@/lib/request-ip';
import { ACCEPTED_FUNNEL_STEPS } from '@/lib/funnel-steps';

// Public, unauthenticated funnel beacon for the pre-signup /start wizard. Only
// accepts a fixed set of step names (ignores anything else) and caps inserts per
// IP so it can't be used to flood the table. Best-effort — always 200 so the
// client beacon never blocks the funnel.
// The allowlist is DERIVED from lib/funnel-steps, never hand-written here.
// This guard silently drops anything it does not recognise and still answers
// 200, so a hand-kept copy that fell behind the funnel cost us every
// Instant Insight measurement. See that file for the full account.
const STEPS = ACCEPTED_FUNNEL_STEPS;

export async function POST(request: NextRequest) {
  let body: { anon?: unknown; step?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const step = typeof body.step === 'string' ? body.step : '';
  if (!STEPS.has(step)) return NextResponse.json({ ok: true });
  const anon = typeof body.anon === 'string' ? body.anon.slice(0, 64) : null;

  const admin = createAdminClient();
  const ip = clientIp(request);

  // Light per-IP flood guard (fail open).
  if (ip) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('funnel_events')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since);
    if ((count ?? 0) >= 300) return NextResponse.json({ ok: true });
  }

  await admin.from('funnel_events').insert({ anon_id: anon, step, ip });
  return NextResponse.json({ ok: true });
}
