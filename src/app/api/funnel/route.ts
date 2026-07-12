import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp } from '@/lib/request-ip';

// Public, unauthenticated funnel beacon for the pre-signup /start wizard. Only
// accepts a fixed set of step names (ignores anything else) and caps inserts per
// IP so it can't be used to flood the table. Best-effort — always 200 so the
// client beacon never blocks the funnel.
const STEPS = new Set([
  'start:landed',      // fired by an inline script the instant /start's HTML parses,
                       // BEFORE the React bundle loads — so it counts every page-open
                       // (matches Meta's Landing Page Views), catching visitors who
                       // bounce before the app hydrates and 'need-check' would fire.
  'start:need-check',
  'start:target-date',
  'start:dream-percentile',
  'start:quick-facts',
  'start:pain-points',
  'start:reassurance',
  'start:topic-coverage',
  'start:mentor',
  'start:login-build',
]);

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
