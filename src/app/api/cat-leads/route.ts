import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp } from '@/lib/request-ip';

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const {
    name, phone, score, tier,
    consistency_score, strategy_score, support_score,
    varc_rating, dilr_rating, qa_rating,
    weak_section, anxiety_idx, belief_idx,
  } = payload as Record<string, unknown>;

  if (typeof name !== 'string' || name.trim().length < 1) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  const phoneDigits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
  if (phoneDigits.length !== 10 || !/^[6-9]/.test(phoneDigits)) {
    return NextResponse.json({ error: 'A valid 10-digit mobile number is required' }, { status: 400 });
  }
  if (typeof score !== 'number' || score < 0 || score > 100) {
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
  }
  if (typeof tier !== 'string' || tier.trim().length < 1) {
    return NextResponse.json({ error: 'Tier is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const ip = clientIp(request);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Per-IP flood guard. The public quiz is unauthenticated and the per-phone
  // dedup below is defeated by rotating fake numbers, so cap distinct leads per
  // IP per day. Silently accept over the cap (same shape as the dedup path) so a
  // spammer gets no signal. Fail OPEN when the IP is unknown.
  const CAT_LEADS_IP_DAILY_CAP = 10;
  if (ip) {
    const { count: ipCount } = await admin
      .from('cat_test_leads')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since24h);
    if ((ipCount ?? 0) >= CAT_LEADS_IP_DAILY_CAP) {
      return NextResponse.json({ ok: true });
    }
  }

  // Dedup: same phone can't submit more than once per 24h — prevents spam, idempotent for legit retries
  const { data: existing } = await admin
    .from('cat_test_leads')
    .select('id')
    .eq('phone', phoneDigits)
    .gte('created_at', since24h)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin.from('cat_test_leads').insert({
    name: name.trim(),
    phone: phoneDigits,
    score,
    tier: tier.trim(),
    consistency_score: typeof consistency_score === 'number' ? consistency_score : null,
    strategy_score:    typeof strategy_score    === 'number' ? strategy_score    : null,
    support_score:     typeof support_score     === 'number' ? support_score     : null,
    varc_rating:       typeof varc_rating       === 'number' ? varc_rating       : null,
    dilr_rating:       typeof dilr_rating       === 'number' ? dilr_rating       : null,
    qa_rating:         typeof qa_rating         === 'number' ? qa_rating         : null,
    weak_section:      typeof weak_section      === 'string' ? weak_section.trim() : null,
    anxiety_idx:       typeof anxiety_idx       === 'number' ? anxiety_idx       : null,
    belief_idx:        typeof belief_idx        === 'number' ? belief_idx        : null,
    ip,
  });

  if (error) {
    console.error('cat_test_leads insert error:', error.message);
    return NextResponse.json({ error: 'Failed to save. Try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
