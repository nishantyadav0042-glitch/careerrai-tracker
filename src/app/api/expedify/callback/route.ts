import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone, phoneVariants } from '@/lib/phone';

// Inbound webhook for Expedify's post-call workflow: after every AI call,
// Expedify POSTs the outcome here and it lands on the student's profile —
// then flows into the leads Excel + lead cards for the human sales team.
// Auth: shared secret header (set EXPEDIFY_CALLBACK_SECRET in Vercel and the
// same value in Expedify's HTTP node).
export async function POST(request: NextRequest) {
  const secret = process.env.EXPEDIFY_CALLBACK_SECRET;
  if (!secret || request.headers.get('x-callback-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const phone = normalizeIndianPhone(typeof b.phone === 'string' ? b.phone : null);
  if (!phone) return NextResponse.json({ error: 'valid phone required' }, { status: 400 });

  const clean = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : null);
  const feedback = {
    disposition: clean(b.disposition, 20),           // HOT/WARM/COLD/NO_ANSWER/APP_ISSUE
    reason_code: clean(b.reason_code, 20),
    drop_reason: clean(b.drop_reason, 40),           // the activation-gold field
    momentum_score: typeof b.momentum_score === 'number' ? Math.max(0, Math.min(5, b.momentum_score)) : null,
    emotional_trigger: clean(b.emotional_trigger, 30),
    notes: clean(b.notes, 500),                      // founder_note / verbatim quote
    at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .update({ call_feedback: feedback })
    // Match across stored phone formats (+91… / 91… / bare) so a drifted number
    // never causes a missed match.
    .in('phone', phoneVariants(phone))
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'no student with that phone' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
