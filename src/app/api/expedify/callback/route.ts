import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';
import { correlate, deriveDedupeKey } from '@/lib/vendor-correlation';
import { flattenExpedifyPayload } from '@/lib/expedify-payload';
import { mergeCallFeedback, parseBool, type PriorFeedback } from '@/lib/call-feedback';

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
  // Phone is stored for a human repairing an unmatched event; it is no longer
  // consulted for identity. See lib/vendor-correlation.
  const phone = normalizeIndianPhone(typeof b.phone === 'string' ? b.phone : null);

  const clean = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : null);
  // Second call on the same student must not blank the fields this payload
  // omits, so the incoming values fold onto whatever is already stored —
  // same shared merge the /outcome webhook uses (lib/call-feedback).
  const incoming = {
    disposition: clean(b.disposition, 20),           // HOT/WARM/COLD/NO_ANSWER/APP_ISSUE
    reason_code: clean(b.reason_code, 20),
    drop_reason: clean(b.drop_reason, 40),           // the activation-gold field
    momentum_score: typeof b.momentum_score === 'number' ? Math.max(0, Math.min(5, b.momentum_score)) : null,
    emotional_trigger: clean(b.emotional_trigger, 30),
    notes: clean(b.notes, 500),                      // founder_note / verbatim quote
    event: clean(b.event, 40) ?? 'callback',
    at: new Date().toISOString(),
    // Riya's post-call record — same fields the /outcome pipe accepts, so the
    // two inbound routes can never disagree about what a call produced.
    lead_type: clean(b.lead_type, 20) ?? clean(b.student_type, 20),
    installed: parseBool(b.installed ?? b.app_installed),
    plan_opened: parseBool(b.plan_opened ?? b.plan_seen),
    next_step: clean(b.next_step, 200) ?? clean(b.next_action, 200),
  };

  const admin = createAdminClient();
  const flat = flattenExpedifyPayload(b);

  // IDENTITY: our correlation reference only. This route previously resolved
  // the student with `.in('phone', variants).limit(1)` — the vendor payload
  // chose the row, and an ambiguous number picked one arbitrarily.
  const correlation = await correlate(admin, flat);
  if (correlation.kind !== 'matched') {
    // The two inbound routes used to disagree: /outcome stored the event and
    // returned success, this one 404'd and stored NOTHING, so an unmatched
    // callback vanished. One policy now — always audit, never guess.
    const { key } = deriveDedupeKey(flat, b, incoming.event ?? 'callback');
    await admin.from('expedify_events').insert({
      event: incoming.event ?? 'callback',
      phone,
      student_id: null,
      dedupe_key: key,
      resolution: 'unmatched',
      payload: b,
    });
    return NextResponse.json({ ok: true, matched: false, resolution: 'unmatched', why: correlation.why }, { status: 200 });
  }

  const { data: existing, error: readError } = await admin
    .from('profiles')
    .select('id, call_feedback')
    .eq('id', correlation.studentId)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: 'lookup failed' }, { status: 503 });
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { error } = await admin
    .from('profiles')
    .update({ call_feedback: mergeCallFeedback(existing.call_feedback as PriorFeedback, incoming) })
    .eq('id', existing.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
