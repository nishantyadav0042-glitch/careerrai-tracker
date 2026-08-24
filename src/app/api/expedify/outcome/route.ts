import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';
import { mergeCallFeedback, parseBool, type PriorFeedback } from '@/lib/call-feedback';
import { flattenExpedifyPayload, pickScore } from '@/lib/expedify-payload';
import { correlate, deriveDedupeKey, readVendorCallId } from '@/lib/vendor-correlation';

// Inbound Expedify webhook — the RETURN pipe.
//
// REWRITTEN 23 Aug 2026. What it used to do, and why that had to stop:
//
//   1. It resolved the student with `.in('phone', variants).limit(1)
//      .maybeSingle()`, so the VENDOR PAYLOAD chose which student row was
//      written, and an ambiguous phone silently picked an arbitrary profile.
//   2. It derived `dedupe_key` only when the vendor supplied a lead id, and
//      NULL otherwise — which slips straight past the UNIQUE index. 239 of 239
//      production rows were NULL, and 220 duplicates of one payload landed on
//      12 August.
//   3. An unmatched event was stored and answered 200, so nobody ever learned
//      it happened. All 239 rows were, in fact, one test string
//      ("first webhook test") attached to the admin's own phone number.
//
// Now: identity comes from OUR correlation reference only, every event carries
// a deterministic idempotency key, and anything we cannot attribute becomes a
// visible UNMATCHED row for the founder to repair by hand.
//
// Auth: shared secret. The header form is preferred; the query-string form is
// still accepted because their builder cannot set headers on every node, and
// removing it unilaterally would silently drop live traffic.

export async function POST(request: NextRequest) {
  const secret = process.env.EXPEDIFY_INBOUND_SECRET;
  if (!secret) {
    // Deliberately inert until configured — never accept unauthenticated data.
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  }
  const provided = request.headers.get('x-expedify-secret') ?? request.nextUrl.searchParams.get('key');
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('not an object');
  } catch {
    return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 });
  }

  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const flat = flattenExpedifyPayload(payload);

  const event =
    str(payload.event) ?? str(payload.type) ?? str(payload.identifier) ?? str(payload.event_type) ?? 'unknown';

  // Phone is still STORED — a human repairing an unmatched event needs it — but
  // it is no longer consulted for identity.
  const rawPhone = str(flat.lead_phone) ?? str(flat.phone) ?? str(flat.contact_phone) ?? str(flat.mobile);
  const phone = rawPhone ? normalizeIndianPhone(rawPhone) : null;

  const admin = createAdminClient();

  // ── Identity: OUR reference, or nothing ───────────────────────────────────
  const correlation = await correlate(admin, flat);
  const studentId = correlation.kind === 'matched' ? correlation.studentId : null;

  // ── Idempotency: a key ALWAYS exists ──────────────────────────────────────
  const { key: dedupeKey, basis } = deriveDedupeKey(flat, payload, event);
  const callId = readVendorCallId(flat);

  // Store first, act second. The audit row is the durable fact; anything we
  // derive from it can be recomputed, but an event we failed to record is gone.
  const { data: inserted, error: insertError } = await admin.from('expedify_events').insert({
    event,
    phone,
    student_id: studentId,
    dedupe_key: dedupeKey,
    resolution: studentId ? 'matched' : 'unmatched',
    payload,
  }).select('id').maybeSingle();

  // A unique violation is a REDELIVERY — success, and deliberately a no-op.
  const duplicate = insertError?.code === '23505';
  if (insertError && !duplicate) {
    console.error('[expedify-outcome] audit insert failed:', insertError.message);
    return NextResponse.json({ error: 'Storage failed — please retry.' }, { status: 500 });
  }
  if (duplicate) {
    return NextResponse.json({ ok: true, event, duplicate: true, matched: correlation.kind === 'matched' });
  }

  // ── Only a correlated event may touch a student ───────────────────────────
  if (correlation.kind !== 'matched') {
    // 200, not an error: the vendor delivered correctly and we stored it. The
    // problem is ours to repair, and it is now visible in the Data Quality
    // panel rather than dissolving into a success response.
    return NextResponse.json({
      ok: true,
      event,
      matched: false,
      resolution: 'unmatched',
      why: correlation.why,
      hint: 'Return external_ref (the CareerRai student id we send you) on every event.',
    });
  }

  const outcome = str(flat.outcome);
  const category = str(flat.category) ?? str(flat.lead_status);
  const callbackAt = str(flat.callback_at) ?? str(flat.callback_requested_at);
  const statusBits = [event, outcome, category, callbackAt ? `callback ${callbackAt}` : null].filter(Boolean);
  const summary = str(flat.agent_summary) ?? str(flat.notes) ?? str(flat.summary) ?? str(flat.reason);

  const { data: prior } = await admin.from('profiles').select('call_feedback').eq('id', studentId).maybeSingle();
  const feedback = mergeCallFeedback(prior?.call_feedback as PriorFeedback, {
    disposition: str(flat.disposition) ?? outcome ?? category,
    reason_code: str(flat.reason_code),
    drop_reason: str(flat.drop_reason),
    momentum_score: pickScore(flat, 'momentum_score'),
    emotional_trigger: str(flat.emotional_trigger) ?? str(flat.pain_point),
    notes: summary,
    event,
    at: new Date().toISOString(),
    lead_type: str(flat.lead_type) ?? str(flat.student_type),
    installed: parseBool(flat.installed ?? flat.app_installed),
    plan_opened: parseBool(flat.plan_opened ?? flat.plan_seen),
    next_step: str(flat.next_step) ?? str(flat.next_action),
  });

  await admin.from('profiles').update({
    expedify_status: statusBits.join(' · ').slice(0, 200),
    expedify_synced_at: new Date().toISOString(),
    call_feedback: feedback,
  }).eq('id', studentId);

  // ── A vendor-confirmed call is a different KIND of fact from a rep's note ──
  // It only earns provenance='vendor_reported' when the vendor supplied their
  // own call id; the DB CHECK enforces that pairing. Without one we still
  // record the activity, but as 'unknown' rather than dressing a summary up as
  // independent evidence.
  if (event === 'call_report' || outcome || callId) {
    const { error: actErr } = await admin.from('sales_activity').insert({
      student_id: studentId,
      // NULL, deliberately. A vendor call has no CareerRai actor, and naming
      // one — the founder, the student, a placeholder — would be a fabricated
      // attribution in the exact table this workstream exists to make
      // trustworthy. The DB constraint permits NULL only for non-human
      // provenance, so this cannot become a way to write anonymous rep activity.
      actor_id: null,
      activity_type: 'call',
      channel: 'phone',
      provenance: callId ? 'vendor_reported' : 'unknown',
      external_ref: callId,
      status: null,
      note: summary ? summary.slice(0, 2000) : null,
    });
    if (actErr) console.error('[expedify-outcome] activity insert failed:', actErr.message);
  }

  return NextResponse.json({
    ok: true,
    event,
    matched: true,
    resolution: 'matched',
    idempotency_basis: basis,
    stored: inserted?.id ?? null,
  });
}
