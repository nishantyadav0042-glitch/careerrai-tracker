import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone, phoneVariants } from '@/lib/phone';
import { mergeCallFeedback, parseBool, type PriorFeedback } from '@/lib/call-feedback';
import { flattenExpedifyPayload, pickScore } from '@/lib/expedify-payload';

// Inbound Expedify webhook — the RETURN pipe. Their workflow POSTs here after
// every call attempt / reschedule / CRM contact update, and everything lands in
// our database:
//   1. The raw payload is ALWAYS stored in expedify_events (audit + replay),
//      keyed by their event identifier — so whichever identifiers their team
//      configures (call reports vs rescheduled calls vs contact updates), we
//      capture them all and can wire new behaviour later without a re-send.
//   2. When the payload matches a student (by phone), the profile's
//      expedify_status is updated and the agent summary is APPENDED to
//      call_feedback — never overwriting founder-written notes.
//
// Auth: ?key=<EXPEDIFY_INBOUND_SECRET> in the URL (their builder can't set
// custom headers on every node) — also accepted as x-expedify-secret header.
// The secret lives in the Vercel env, never in this public repo.
//
// Idempotency: when the payload carries a lead id + attempt number, retried
// deliveries collapse onto one row via dedupe_key.

export async function POST(request: NextRequest) {
  const secret = process.env.EXPEDIFY_INBOUND_SECRET;
  if (!secret) {
    // Deliberately inert until configured — never accept unauthenticated data.
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  }
  const provided = request.nextUrl.searchParams.get('key') ?? request.headers.get('x-expedify-secret');
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
  // Both dialects Expedify speaks, read as one (lib/expedify-payload).
  const flat = flattenExpedifyPayload(payload);

  // Their event identifier — accept the common field names so whatever the
  // founder agrees with their team ("I will tell you the identifiers") just works.
  const event =
    str(payload.event) ?? str(payload.type) ?? str(payload.identifier) ?? str(payload.event_type) ?? 'unknown';

  // Phone — accept the likely field names, normalize to +91 E.164.
  const rawPhone =
    str(flat.lead_phone) ?? str(flat.phone) ?? str(flat.contact_phone) ?? str(flat.mobile);
  const phone = rawPhone ? normalizeIndianPhone(rawPhone) : null;

  const admin = createAdminClient();

  // Match to a student when possible (never required — unknown numbers still audit).
  let studentId: string | null = null;
  if (phone) {
    // Match across every stored phone format (+91… / 91… / bare 10-digit) so a
    // drifted number never causes a missed match.
    const { data } = await admin.from('profiles').select('id, call_feedback').in('phone', phoneVariants(phone)).limit(1).maybeSingle();
    studentId = data?.id ?? null;

    if (studentId) {
      // Compact status for the admin Leads card: "event · outcome · category".
      const outcome = str(flat.outcome);
      const category = str(flat.category) ?? str(flat.lead_status);
      const callbackAt = str(flat.callback_at) ?? str(flat.callback_requested_at);
      const statusBits = [event, outcome, category, callbackAt ? `callback ${callbackAt}` : null].filter(Boolean);

      // call_feedback is jsonb, and this route used to write a bare STRING into
      // it while /expedify/callback wrote an object and the leads export read
      // `.disposition` / `.notes` off that object. Result: every outcome this
      // route recorded exported as blank columns, and folding a string onto an
      // existing object produced "[object Object]". One shared merge now owns
      // the shape, and a sparse event can no longer erase what an earlier call
      // learned (lib/call-feedback).
      // Riya's own post-call record (EXPEDIFY-RIYA-PROMPT.txt), plus the names
      // their CRM extraction already uses on real calls (`pain_point`,
      // `reason`, `lead_status`) — observed in a live 29 Jul payload. Accepting
      // both means neither side has to be rebuilt to match the other.
      const summary = str(flat.agent_summary) ?? str(flat.notes) ?? str(flat.summary) ?? str(flat.reason);
      const feedback = mergeCallFeedback(data?.call_feedback as PriorFeedback, {
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
    }
  }

  // Always audit the raw event. Dedupe on their lead id + attempt + event when present.
  // NOT keyed on their `entity_id`: contact.updated fires repeatedly for the
  // same contact and carries no attempt number, so an entity-keyed dedupe
  // would collapse every later call onto the first row and silently discard
  // the newer outcomes. Only ids that identify one call attempt belong here.
  const leadId = str(flat.expedify_lead_id) ?? str(flat.lead_id) ?? str(flat.contact_id);
  const attempt = flat.attempt_number != null ? String(flat.attempt_number) : null;
  const dedupeKey = leadId ? [leadId, attempt ?? 'x', event].join(':') : null;

  const { error: insertError } = await admin.from('expedify_events').insert({
    event,
    phone,
    student_id: studentId,
    dedupe_key: dedupeKey,
    payload,
  });
  // Unique-violation on dedupe_key = a retried delivery — that's success, not failure.
  const duplicate = insertError?.code === '23505';
  if (insertError && !duplicate) {
    console.error('[expedify-outcome] audit insert failed:', insertError.message);
    return NextResponse.json({ error: 'Storage failed — please retry.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    event,
    matched_student: !!studentId,
    duplicate,
  });
}
