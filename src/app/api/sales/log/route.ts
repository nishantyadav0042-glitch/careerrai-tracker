import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCallOutcome, isConnectedOutcome, planDisposition } from '@/lib/sales-disposition';
import { salesPrincipal } from '@/lib/sales-authz';

// Disposition endpoint — the heart of the dialer CRM. Every call MUST end in a
// disposition. The vocabulary and the disposition → state mapping live in ONE
// place (lib/sales-disposition) shared with the DB CHECK; this route only
// authenticates, validates, and persists.
//
// TRUTH RULE (20 Aug, Sales Phase 1): a failed DB write returns non-2xx. The
// original version ignored both write errors and returned {ok:true} while the
// production CHECK rejected status='no_answer' — the lead silently left the
// queue forever and history said the call happened. Never again: the client
// only advances on a confirmed write.

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  // R3 (23 Aug): the actor is the authenticated profiles.id. This used to be
  // `email ?? full_name ?? 'sales'` — three different encodings of one person,
  // so two staff without an email collapsed into the literal actor 'sales' and
  // history could not name who made a call.
  const principal = await salesPrincipal(admin, user.id);
  if (!principal) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { studentId, outcome, note, callbackAt, hot } = body ?? {};
  if (typeof studentId !== 'string' || !isCallOutcome(outcome)) {
    return NextResponse.json({ error: 'Invalid disposition' }, { status: 400 });
  }
  const noteText = typeof note === 'string' ? note.trim() : '';
  // Feedback is mandatory on a connected call (not on a no-answer).
  if (isConnectedOutcome(outcome) && noteText.length === 0) {
    return NextResponse.json({ error: 'Feedback is required for a connected call.' }, { status: 400 });
  }
  // A callback needs a time.
  if (outcome === 'callback' && !(typeof callbackAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(callbackAt))) {
    return NextResponse.json({ error: 'Pick a callback time.' }, { status: 400 });
  }

  const actor = principal.id;

  // SA-1D: claim before write. One shared book — logging a call claims the
  // lead atomically (single conditional statement in the claim_lead RPC).
  // If another rep already owns it, NOTHING is written and the client keeps
  // the card: a failed claim must never look like a logged call.
  const { data: claimRows, error: claimError } = await admin.rpc('claim_lead', {
    p_student_id: studentId,
    p_owner: actor,
  });
  if (claimError) {
    console.error('[sales/log] claim_lead failed:', claimError.message);
    return NextResponse.json({ error: 'Could not claim the lead — try again.' }, { status: 500 });
  }
  const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
  if (!claim?.claimed) {
    return NextResponse.json(
      // Deliberately does NOT echo `claim.current_owner`: that value is now a
      // staff profiles.id, and a rep has no business learning another rep's
      // identity key from an error body.
      { error: 'This lead is owned by another rep — ask an admin to reassign it.' },
      { status: 409 },
    );
  }

  const { data: cur } = await admin.from('lead_outreach').select('no_answer_count').eq('student_id', studentId).maybeSingle();
  const prevMisses = (cur?.no_answer_count as number | null) ?? 0;

  const plan = planDisposition(outcome, {
    prevMisses,
    hot: hot === true,
    callbackAtLocal: typeof callbackAt === 'string' ? callbackAt : null,
    nowMs: Date.now(),
  });

  const now = new Date().toISOString();

  // State first, then history — and BOTH checked. If state fails we stop
  // before writing history, so the two can never contradict each other.
  const { error: stateError } = await admin.from('lead_outreach').upsert({
    student_id: studentId,
    status: plan.status,
    callback_at: plan.callbackAt,
    next_action_at: plan.nextActionAt,
    last_attempt_at: now,
    no_answer_count: plan.noAnswerCount,
    notes: noteText || null,
    // owner is deliberately absent: ownership is written ONLY by the atomic
    // claim above and by the admin reassign route — never by a plain upsert.
    updated_at: now,
  });
  if (stateError) {
    console.error('[sales/log] lead_outreach upsert failed:', stateError.message);
    return NextResponse.json({ error: 'Could not save the call — try again.' }, { status: 500 });
  }

  const { error: historyError } = await admin.from('sales_activity').insert({
    student_id: studentId,
    actor,
    status: outcome,
    note: noteText || (outcome === 'no_answer' ? 'Did not pick up' : null),
    callback_at: plan.callbackAt,
  });
  if (historyError) {
    console.error('[sales/log] sales_activity insert failed:', historyError.message);
    return NextResponse.json({ error: 'Call state saved but history write failed — retry to record it.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
