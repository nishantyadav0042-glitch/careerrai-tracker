import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCallOutcome, isConnectedOutcome, planDisposition } from '@/lib/sales-disposition';
import {
  canAccessLead, checkSalesTarget, loadStaffDirectory, resolveLeadOwner, salesPrincipal,
} from '@/lib/sales-authz';
import { completeDueFollowups, scheduleFollowup } from '@/lib/sales-followup';
import { captureStateSnapshot, recordIntervention, interventionTypeForLane } from '@/lib/intervention-ledger';
import { isReasonCategory, reasonNeedsVerbatim } from '@/lib/intervention-taxonomy';

// Disposition endpoint — the heart of the dialer CRM. Every call MUST end in a
// disposition. The vocabulary and the disposition → state mapping live in ONE
// place (lib/sales-disposition) shared with the DB CHECK; this route only
// authenticates, authorizes, validates, and persists.
//
// TRUTH RULE (20 Aug, Sales Phase 1): a failed DB write returns non-2xx. The
// original version ignored both write errors and returned {ok:true} while the
// production CHECK rejected status='no_answer' — the lead silently left the
// queue forever and history said the call happened.
//
// SECURITY STOP 1 (23 Aug): `studentId` was validated as `typeof === 'string'`
// and nothing else. A rep could POST any uuid — including the admin's — and
// claim that person as her lead, and sales_activity had no foreign key, so a
// wholly invented uuid persisted as history. Three gates now stand in front of
// the write: the id must be a uuid, it must resolve to a real non-test STUDENT,
// and the caller must be allowed to act on that lead.
//
// PROVENANCE (23 Aug): a rep typing "called" is not evidence that a call
// happened. Every row this route writes is provenance='self_reported'. The
// system has no telephony record, and a founder dashboard that renders a
// self-report as observed fact is a fiction with a chart on it.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  // The actor is the authenticated profiles.id. This used to be
  // `email ?? full_name ?? 'sales'` — three encodings of one person, so two
  // staff without an email collapsed onto the literal actor 'sales'.
  const principal = await salesPrincipal(admin, user.id);
  if (!principal) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { studentId, outcome, note, callbackAt, hot,
          reasonCategory, reasonVerbatim, askMade, microCommitment, channel } = body ?? {};
  if (!isCallOutcome(outcome)) {
    return NextResponse.json({ error: 'Invalid disposition' }, { status: 400 });
  }
  // The learning fields are validated HERE, before anything is written, so a
  // malformed reason fails the whole request rather than silently producing a
  // call with no lesson attached.
  if (reasonCategory != null && !isReasonCategory(reasonCategory)) {
    return NextResponse.json({ error: 'Unknown reason category.' }, { status: 400 });
  }
  if (reasonNeedsVerbatim(reasonCategory) &&
      !(typeof reasonVerbatim === 'string' && reasonVerbatim.trim().length >= 3)) {
    return NextResponse.json(
      { error: "Choosing 'Other' needs the student's own words — that free text is the whole point." },
      { status: 400 },
    );
  }

  // ── GATE 1: is this id even allowed to be a sales subject? ────────────────
  const target = await checkSalesTarget(admin, studentId);
  if (!target.ok) {
    if (target.reason === 'unavailable') {
      // A read we could not complete is not a rejection of the student — say so
      // with a 503 rather than a 404 that would read as "no such person".
      return NextResponse.json({ error: 'Could not verify the student — try again.' }, { status: 503 });
    }
    // One response for malformed / not-found / not-a-student / test-account, so
    // a rep cannot use this endpoint to enumerate who exists or what role they
    // hold.
    return NextResponse.json({ error: 'Not a valid lead.' }, { status: 404 });
  }

  // ── GATE 2: may THIS actor act on THIS lead? ──────────────────────────────
  const dir = await loadStaffDirectory(admin);
  const ownership = await resolveLeadOwner(admin, studentId, dir);
  if (!canAccessLead(ownership, principal)) {
    return NextResponse.json({ error: 'This lead belongs to another rep.' }, { status: 403 });
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

  // ── The learning snapshot, taken BEFORE anything is written ───────────────
  // The student's state at the moment of the intervention is the baseline the
  // outcome will later be judged against, so it must be read before this
  // request mutates lead state. Best-effort: a snapshot we cannot complete
  // must not block a rep from logging their call.
  let snapshot = null as Awaited<ReturnType<typeof captureStateSnapshot>> | null;
  try {
    snapshot = await captureStateSnapshot(admin, studentId);
  } catch (e) {
    console.error('[sales/log] state snapshot failed:', (e as Error).message);
  }

  // ── GATE 3: claim before write ────────────────────────────────────────────
  // SA-1D: one shared book — logging a call claims the lead atomically (a
  // single conditional statement inside the claim_lead RPC). If another rep
  // already owns it, NOTHING is written and the client keeps the card: a failed
  // claim must never look like a logged call.
  const { data: claimRows, error: claimError } = await admin.rpc('claim_lead', {
    p_student_id: studentId,
    p_owner_id: principal.id,
  });
  if (claimError) {
    console.error('[sales/log] claim_lead failed:', claimError.message);
    return NextResponse.json({ error: 'Could not claim the lead — try again.' }, { status: 500 });
  }
  const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
  if (!claim?.claimed) {
    // Deliberately does NOT echo claim.current_owner: that is a staff
    // profiles.id, and a rep has no business learning another rep's identity
    // key from an error body.
    return NextResponse.json(
      { error: 'This lead is owned by another rep — ask an admin to reassign it.' },
      { status: 409 },
    );
  }

  const { data: cur } = await admin.from('lead_outreach')
    .select('no_answer_count, first_contact_at').eq('student_id', studentId).maybeSingle();
  const prevMisses = (cur?.no_answer_count as number | null) ?? 0;

  const plan = planDisposition(outcome, {
    prevMisses,
    hot: hot === true,
    callbackAtLocal: typeof callbackAt === 'string' ? callbackAt : null,
    nowMs: Date.now(),
  });

  const now = new Date().toISOString();

  // FIRST contact, and only the first. Written once and never moved forward,
  // because the SLA measures how long the STUDENT waited to hear from anyone —
  // overwriting it on the fifth call would make every lead look instantly
  // answered. `last_attempt_at` below is the one that tracks the latest call.
  const firstContactAt = (cur?.first_contact_at as string | null) ?? now;

  // State first, then history — and BOTH checked. If state fails we stop before
  // writing history, so the two can never contradict each other.
  const { error: stateError } = await admin.from('lead_outreach').upsert({
    student_id: studentId,
    status: plan.status,
    callback_at: plan.callbackAt,
    next_action_at: plan.nextActionAt,
    last_attempt_at: now,
    first_contact_at: firstContactAt,
    no_answer_count: plan.noAnswerCount,
    notes: noteText || null,
    // owner_id is deliberately absent: ownership is written ONLY by the atomic
    // claim above and by the admin reassign route — never by a plain upsert.
    updated_at: now,
  });
  if (stateError) {
    console.error('[sales/log] lead_outreach upsert failed:', stateError.message);
    return NextResponse.json({ error: 'Could not save the call — try again.' }, { status: 500 });
  }

  const { data: activity, error: historyError } = await admin.from('sales_activity').insert({
    student_id: studentId,
    actor_id: principal.id,
    activity_type: 'call',
    channel: 'phone',
    // The honest default. Nothing in this system independently observes that a
    // call took place — no call id, no duration, no recording.
    provenance: 'self_reported',
    status: outcome,
    note: noteText || (outcome === 'no_answer' ? 'Did not pick up' : null),
    callback_at: plan.callbackAt,
  }).select('id').single();
  if (historyError) {
    console.error('[sales/log] sales_activity insert failed:', historyError.message);
    return NextResponse.json({ error: 'Call state saved but history write failed — retry to record it.' }, { status: 500 });
  }

  // ── Follow-up history ─────────────────────────────────────────────────────
  // next_action_at drives the queue and is OVERWRITTEN on every disposition, so
  // it can never answer "was the promised follow-up actually done?". These two
  // calls are that record. Neither may fail the request: the call itself is
  // saved and confirmed, and losing the history footnote must not tell the rep
  // her logged call did not stick.
  await completeDueFollowups(admin, {
    studentId, actorId: principal.id, outcome, activityId: activity?.id as number | undefined,
  });
  if (plan.nextActionAt) {
    await scheduleFollowup(admin, {
      studentId,
      ownerId: principal.id,
      createdBy: principal.id,
      dueAt: plan.nextActionAt,
      reason: outcome === 'callback' ? 'Student asked for a callback' : `Cadence after '${outcome}'`,
      channel: 'phone',
    });
  }

  // ── The learning record ───────────────────────────────────────────────────
  // Written LAST and never allowed to fail the request: the rep's call is
  // already saved and confirmed, and losing the lesson must not tell them
  // their logged call did not stick.
  //
  // But the failure IS returned (`ledgerRecorded: false`) rather than
  // swallowed — a ledger that quietly stops being complete is worse than one
  // that is obviously broken, because every trend built on it would be wrong
  // and nothing would say so.
  let ledgerRecorded = false;
  if (snapshot) {
    const written = await recordIntervention(admin, {
      studentId,
      repId: principal.id,
      activityId: activity?.id as number | undefined,
      channel: channel === 'whatsapp' ? 'whatsapp' : 'phone',
      // Derived from the lane the rep was working, so it stays consistent
      // across reps and is one fewer field to fill.
      interventionType: interventionTypeForLane(snapshot.lane),
      askMade: typeof askMade === 'string' ? askMade : null,
      microCommitment: microCommitment === true,
      reasonCategory: reasonCategory ?? null,
      reasonVerbatim: typeof reasonVerbatim === 'string' ? reasonVerbatim : null,
    }, snapshot);
    ledgerRecorded = written.ok;
  }

  return NextResponse.json({ ok: true, ledgerRecorded });
}
