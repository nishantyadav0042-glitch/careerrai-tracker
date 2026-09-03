import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCallOutcome, isConnectedOutcome, isSkipReason, planDisposition, type CallOutcome } from '@/lib/sales-disposition';
import {
  canAccessLead, checkSalesTarget, loadStaffDirectory, resolveLeadOwner, salesPrincipal,
} from '@/lib/sales-authz';
import { completeDueFollowups, scheduleFollowup } from '@/lib/sales-followup';
import { resolveConvertedClaim } from '@/lib/sales-conversion-truth';
import { markSkipped, markWorked } from '@/lib/sales-opportunity-record';
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
  const { studentId, outcome, note, callbackAt, hot, skipReason,
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

  // ── A SKIP CLOSES THE CARD AND TOUCHES NOTHING ELSE ──────────────────────
  //
  // Founder, 3 Sep 2026: "make sure they mark every list close." A counsellor
  // who cannot honestly log a call had no way to close a card, so 240 of the
  // 241 cards ever dealt sat open forever and "worked_at is null" meant three
  // different things at once.
  //
  // This branch is deliberately the shortest path in the file. A skip is NOT a
  // contact: no lead_outreach write (so no status, no last_attempt_at, no
  // clock, no miss count), no follow-up, no intervention ledger, and it never
  // counts as reaching anybody. Nothing happened to the student, so the
  // student's state must not change — they return to tomorrow's queue on
  // exactly the same terms. A skip buys a day, never a disappearance.
  //
  // What it DOES do is leave two rows: the history of who skipped what and
  // why, and the closed card. That is the whole difference between a list and
  // a suggestion.
  if (outcome === 'skipped') {
    if (!isSkipReason(skipReason)) {
      return NextResponse.json({ error: 'Say why you are skipping this student.' }, { status: 400 });
    }
    const { error: skipHistoryError } = await admin.from('sales_activity').insert({
      student_id: studentId,
      actor_id: principal.id,
      activity_type: 'skip',
      channel: null,
      provenance: 'self_reported',
      status: 'skipped',
      note: noteText || `Skipped: ${skipReason.replace(/_/g, ' ')}`,
    });
    if (skipHistoryError) {
      console.error('[sales/log] skip history insert failed:', skipHistoryError.message);
      return NextResponse.json({ error: 'Could not record the skip — try again.' }, { status: 500 });
    }
    // Checked, unlike markWorked's best-effort call: closing the card IS the
    // entire point of a skip. If this fails the counsellor must know, because
    // the card is still open and their screen would otherwise say it is done.
    const closed = await markSkipped(admin, principal.id, studentId, skipReason);
    if (!closed) {
      return NextResponse.json({ error: 'Skip recorded, but the card did not close — refresh and try again.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, skipped: true });
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
    .select('no_answer_count, first_contact_at, status, next_action_at, callback_at').eq('student_id', studentId).maybeSingle();
  const prevMisses = (cur?.no_answer_count as number | null) ?? 0;

  // ── A CLAIMED CONVERSION IS NOT A CONVERSION (Incident #52) ──────────────
  //
  // Before this, outcome='converted' wrote status='converted', and the queue
  // treated that as "gone forever" — so one mistaken tap deleted a student from
  // every future queue with no payment anywhere. The payment ledger is the only
  // thing that may convert a student (SALES-OS.md §3 rule 1).
  //
  // The claim is NOT discarded: it is recorded in sales_activity below with the
  // rep's own outcome and self_reported provenance, so what they believed is
  // preserved as history. Only the STATE is corrected, and only downward — a
  // real payment still converts.
  //
  // A read failure is NOT "they have not paid". `null` flows through
  // resolveConvertedClaim() as unverified, which keeps the student actionable
  // rather than closing them on a claim we could not check.
  let paidKnown: boolean | null = null;
  if (outcome === 'converted') {
    const { data: paidRow, error: paidErr } = await admin
      .from('student_payments').select('id').eq('student_id', studentId).eq('status', 'paid').limit(1);
    paidKnown = paidErr ? null : (paidRow ?? []).length > 0;
  }
  const convertedClaim = outcome === 'converted' ? resolveConvertedClaim(paidKnown) : null;
  const effectiveOutcome: CallOutcome =
    convertedClaim && convertedClaim.status === 'interested' ? 'interested' : outcome;

  let plan = planDisposition(effectiveOutcome, {
    prevMisses,
    hot: hot === true,
    callbackAtLocal: typeof callbackAt === 'string' ? callbackAt : null,
    nowMs: Date.now(),
  });
  // A MESSAGE NEVER DOWNGRADES A LIVE STATE (2 Sep 2026). A student who said
  // "interested" or asked for a callback keeps that status and its clock; the
  // message is recorded as a touch in history and on last_attempt_at only.
  const LIVE = new Set(['interested', 'follow_up', 'no_answer']);
  if (outcome === 'messaged' && cur?.status && LIVE.has(cur.status as string)) {
    plan = {
      status: cur.status as typeof plan.status,
      nextActionAt: (cur.next_action_at as string | null) ?? null,
      callbackAt: (cur.callback_at as string | null) ?? null,
      noAnswerCount: prevMisses,
    };
  }

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
    // A WhatsApp message is its own channel and activity (2 Sep 2026).
    activity_type: outcome === 'messaged' ? 'whatsapp' : 'call',
    channel: outcome === 'messaged' ? 'whatsapp' : 'phone',
    // The honest default. Nothing in this system independently observes that a
    // call took place — no call id, no duration, no recording.
    provenance: 'self_reported',
    status: outcome,
    note: noteText || (outcome === 'no_answer' ? 'Did not pick up' : outcome === 'messaged' ? 'Sent a WhatsApp message' : null),
    callback_at: plan.callbackAt,
  }).select('id').single();
  if (historyError) {
    console.error('[sales/log] sales_activity insert failed:', historyError.message);
    return NextResponse.json({ error: 'Call state saved but history write failed — retry to record it.' }, { status: 500 });
  }

  // ── Today's coverage ──────────────────────────────────────────────────────
  // WORKED MEANS DISPOSITIONED, and this is the only place that says so. No
  // tap, card-open or dial reaches sales_opportunity.worked_at — a counter any
  // tap could advance is a counter that will be advanced by tapping
  // (SALES-OS.md §0, telemetry is P5 and may not become a performance measure).
  //
  // The rep's own outcome is recorded here, not the payment-corrected one: this
  // row is what THEY did, and conversion truth lives in the payment ledger.
  // Never allowed to fail the request — the call is already saved.
  await markWorked(admin, principal.id, studentId, outcome);

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
      channel: outcome === 'messaged' || channel === 'whatsapp' ? 'whatsapp' : 'phone',
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
