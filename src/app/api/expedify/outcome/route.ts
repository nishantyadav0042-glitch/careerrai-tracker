import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone, phoneVariants } from '@/lib/phone';
import { mergeCallFeedback, type PriorFeedback } from '@/lib/call-feedback';

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

  // Their event identifier — accept the common field names so whatever the
  // founder agrees with their team ("I will tell you the identifiers") just works.
  const event =
    str(payload.event) ?? str(payload.type) ?? str(payload.identifier) ?? str(payload.event_type) ?? 'unknown';

  // Phone — accept the likely field names, normalize to +91 E.164.
  const rawPhone =
    str(payload.lead_phone) ?? str(payload.phone) ?? str(payload.contact_phone) ?? str(payload.mobile);
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
      const outcome = str(payload.outcome);
      const category = str(payload.category);
      const callbackAt = str(payload.callback_at);
      const statusBits = [event, outcome, category, callbackAt ? `callback ${callbackAt}` : null].filter(Boolean);

      // call_feedback is jsonb, and this route used to write a bare STRING into
      // it while /expedify/callback wrote an object and the leads export read
      // `.disposition` / `.notes` off that object. Result: every outcome this
      // route recorded exported as blank columns, and folding a string onto an
      // existing object produced "[object Object]". One shared merge now owns
      // the shape, and a sparse event can no longer erase what an earlier call
      // learned (lib/call-feedback).
      const summary = str(payload.agent_summary) ?? str(payload.notes) ?? str(payload.summary);
      const momentum = typeof payload.momentum_score === 'number'
        ? Math.max(0, Math.min(5, payload.momentum_score)) : null;
      const feedback = mergeCallFeedback(data?.call_feedback as PriorFeedback, {
        disposition: str(payload.disposition) ?? outcome ?? category,
        reason_code: str(payload.reason_code),
        drop_reason: str(payload.drop_reason),
        momentum_score: momentum,
        emotional_trigger: str(payload.emotional_trigger),
        notes: summary,
        event,
        at: new Date().toISOString(),
      });

      await admin.from('profiles').update({
        expedify_status: statusBits.join(' · ').slice(0, 200),
        expedify_synced_at: new Date().toISOString(),
        call_feedback: feedback,
      }).eq('id', studentId);
    }
  }

  // Always audit the raw event. Dedupe on their lead id + attempt + event when present.
  const leadId = str(payload.expedify_lead_id) ?? str(payload.lead_id) ?? str(payload.contact_id);
  const attempt = payload.attempt_number != null ? String(payload.attempt_number) : null;
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
