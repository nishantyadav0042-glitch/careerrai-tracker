import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { name, phone, score, tier } = payload as Record<string, unknown>;

  if (typeof name !== 'string' || name.trim().length < 1) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (typeof phone !== 'string' || phone.replace(/\D/g, '').length < 10) {
    return NextResponse.json({ error: 'A valid 10-digit phone number is required' }, { status: 400 });
  }
  if (typeof score !== 'number' || score < 0 || score > 100) {
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
  }
  if (typeof tier !== 'string' || tier.trim().length < 1) {
    return NextResponse.json({ error: 'Tier is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Dedup: same phone can't submit more than once per 24h — prevents spam, idempotent for legit retries
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await admin
    .from('cat_test_leads')
    .select('id')
    .eq('phone', phone.trim())
    .gte('created_at', since24h)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin.from('cat_test_leads').insert({
    name: name.trim(),
    phone: phone.trim(),
    score,
    tier: tier.trim(),
  });

  if (error) {
    console.error('cat_test_leads insert error:', error.message);
    return NextResponse.json({ error: 'Failed to save. Try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
