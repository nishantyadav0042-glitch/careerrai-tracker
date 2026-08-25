import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateSlots, slotsByDay, type Availability, type BusySpan } from '@/lib/session-slots';
import { mentorBookability, UNBOOKABLE_COPY } from '@/lib/session-assignment';
import { constraintFailure } from '@/lib/booking-constraints';
import { ensureBuddyRoom } from '@/lib/buddy-room';
import { SESSION_MINUTES } from '@/lib/session-credit';
import { emitTimeline } from '@/lib/os/timeline';

// ── The student picks their own time ────────────────────────────────────────
//
// GET  — the slots this student may actually choose.
// POST — take one, atomically.
//
// THE DIVISION OF LABOUR: lib/session-slots computes what to OFFER; the
// DATABASE decides what is ACCEPTED. Two students can be shown 11:00 at the
// same moment and only one insert can win — the GIST exclusion constraint on
// (buddy_id, session_span) is what makes the loser lose cleanly instead of
// double-booking a human. Nothing here reserves anything; a slot list is an
// invitation.

export const dynamic = 'force-dynamic';

/** The student's own paid, assigned, not-yet-scheduled credit. */
async function loadCredit(admin: ReturnType<typeof createAdminClient>, studentId: string) {
  return admin
    .from('session_credits')
    .select('id, buddy_id, status, video_session_id, session_intent, session_intent_note')
    .eq('student_id', studentId)
    .in('status', ['paid', 'assigned', 'scheduled'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: credit, error } = await loadCredit(admin, user.id);
  if (error) {
    console.error('[sessions/schedule] credit read failed:', error.message);
    return NextResponse.json({ error: 'Could not open your session — try again.' }, { status: 503 });
  }
  if (!credit) return NextResponse.json({ state: 'no_credit' });

  // Already booked. The student sees their session, not a picker.
  if (credit.video_session_id) {
    return NextResponse.json({ state: 'already_scheduled', sessionId: credit.video_session_id });
  }

  // Paid but nobody assigned yet. NOT an error and NOT a lost credit — the
  // entitlement is intact and the team can see it waiting.
  if (!credit.buddy_id) {
    return NextResponse.json({
      state: 'awaiting_assignment',
      message: 'We have your payment. We are matching you with the right buddy.',
    });
  }

  const bookable = await mentorBookability(admin, credit.buddy_id);
  if (!bookable.bookable) {
    // The mentor cannot actually produce a meeting room or has no calendar.
    // Offering slots here would sell a booking nobody can join — which is how
    // sixteen sessions were created and none delivered.
    return NextResponse.json({
      state: 'needs_team',
      reason: bookable.reason,
      message: UNBOOKABLE_COPY[bookable.reason],
    });
  }

  const [{ data: avail }, { data: busy }, { data: buddy }] = await Promise.all([
    admin.from('buddy_availability').select('*').eq('buddy_id', credit.buddy_id).maybeSingle(),
    admin.from('video_sessions')
      .select('scheduled_at, duration_minutes')
      .eq('buddy_id', credit.buddy_id)
      .in('session_status', ['scheduled', 'active'])
      .gte('scheduled_at', new Date(Date.now() - 86_400_000).toISOString()),
    admin.from('profiles').select('full_name').eq('id', credit.buddy_id).maybeSingle(),
  ]);
  if (!avail) return NextResponse.json({ state: 'needs_team', reason: 'no_availability', message: UNBOOKABLE_COPY.no_availability });

  const a: Availability = {
    timezone: avail.timezone as string,
    workDays: (avail.work_days as number[]) ?? [],
    startMinute: avail.start_minute as number,
    endMinute: avail.end_minute as number,
    slotMinutes: avail.slot_minutes as number,
    bufferMinutes: avail.buffer_minutes as number,
    maxPerDay: (avail.max_per_day as number | null) ?? null,
    horizonDays: avail.horizon_days as number,
    minNoticeMinutes: avail.min_notice_minutes as number,
    active: avail.active as boolean,
  };
  const spans: BusySpan[] = (busy ?? []).map((b) => {
    const start = Date.parse(b.scheduled_at as string);
    return { startMs: start, endMs: start + (((b.duration_minutes as number) ?? 30) + a.bufferMinutes) * 60_000 };
  });

  const slots = generateSlots(a, spans, Date.now());
  return NextResponse.json({
    state: slots.length > 0 ? 'choose_slot' : 'no_slots',
    message: slots.length > 0 ? null : UNBOOKABLE_COPY.not_taking_bookings,
    buddyName: ((buddy?.full_name as string | null) ?? 'Your buddy').split(' ')[0],
    intent: credit.session_intent,
    intentNote: credit.session_intent_note,
    timezone: a.timezone,
    days: slotsByDay(slots).map((d) => ({
      day: d.day,
      slots: d.slots.map((s) => ({ startIso: s.startIso, label: s.label })),
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const startIso = (body as { startIso?: unknown }).startIso;
  if (typeof startIso !== 'string' || Number.isNaN(Date.parse(startIso))) {
    return NextResponse.json({ error: 'Pick a time.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: credit, error } = await loadCredit(admin, user.id);
  if (error) {
    console.error('[sessions/schedule] credit read failed:', error.message);
    return NextResponse.json({ error: 'Could not open your session — try again.' }, { status: 503 });
  }
  if (!credit) return NextResponse.json({ error: 'No session to schedule.' }, { status: 404 });

  // IDEMPOTENT. A double-click, a retry, a refresh — the credit already points
  // at a session, so the answer is that session, not a second one.
  if (credit.video_session_id) {
    return NextResponse.json({ ok: true, sessionId: credit.video_session_id, already: true });
  }
  if (!credit.buddy_id) {
    return NextResponse.json({ error: 'We are still matching you with a buddy.' }, { status: 409 });
  }

  const bookable = await mentorBookability(admin, credit.buddy_id);
  if (!bookable.bookable) {
    return NextResponse.json(
      { error: UNBOOKABLE_COPY[bookable.reason], reason: bookable.reason }, { status: 409 },
    );
  }

  // The room BEFORE the row. A session without a link is the failure this
  // whole product has already lived through once.
  const room = await ensureBuddyRoom(credit.buddy_id);
  if (!room.ok) {
    return NextResponse.json(
      { error: UNBOOKABLE_COPY.no_meeting_room, reason: 'no_meeting_room' }, { status: 409 },
    );
  }

  // ── ONE OPERATION ─────────────────────────────────────────────────────────
  //
  // This used to be an insert followed by a separate update, with nothing
  // spanning them. If the process died in between, the session existed and the
  // credit did not know — which is the shape Phase 0 found at rest: 18
  // sessions, none linked to any credit, ever.
  //
  // Worse, the link step was `.update(...).is('video_session_id', null)` with
  // no `.select()` and no `{ count: 'exact' }`, so PostgREST answered a
  // ZERO-ROW update with `{ data: null, error: null }` — indistinguishable
  // from success. Two concurrent taps therefore made two sessions, linked one,
  // orphaned the other, and told the student both were booked. The
  // compensating "cancel the orphan" only ran on `linkError`, which was null
  // in exactly that case, so it never fired.
  //
  // book_session_credit() locks the credit, creates the session, links it and
  // moves the state inside ONE transaction. It does not decide anything new:
  // video_sessions' own guards still validate the slot, and
  // session_credit_coherent() still governs the credit.
  const { data: booking, error: rpcError } = await admin.rpc('book_session_credit', {
    p_credit_id: credit.id,
    p_student_id: user.id,
    p_expected_buddy_id: credit.buddy_id,
    p_start: new Date(startIso).toISOString(),
    p_duration_minutes: SESSION_MINUTES,
    p_meet_url: room.meetUrl,
  });

  if (rpcError || !booking?.[0]) {
    console.error('[sessions/schedule] booking failed:', rpcError?.message);
    return NextResponse.json({ error: 'Could not book that time — try again.' }, { status: 500 });
  }

  const { outcome, session_id: sessionId, detail } = booking[0];

  // A booking rule the student can act on is a 409, never a 500 — a 500 tells
  // them something is broken and invites a retry that can only fail the same
  // way forever (lib/booking-constraints.ts).
  if (outcome === 'slot_taken' || outcome === 'session_exists') {
    // The wording lives in ONE module so the two write paths cannot drift.
    const refused = constraintFailure(
      { code: outcome === 'slot_taken' ? '23P01' : '23505' }, 'student',
    )!;
    return NextResponse.json({ error: refused.message, reason: refused.reason }, { status: 409 });
  }
  if (outcome === 'unavailable' || outcome === 'not_eligible' || outcome === 'mentor_changed') {
    // `detail` is already written for a student — the availability guard's
    // messages are prose, not error codes.
    return NextResponse.json({ error: detail ?? 'That booking is not available.', reason: outcome }, { status: 409 });
  }

  if (outcome === 'already_booked') {
    return NextResponse.json({ ok: true, sessionId, already: true });
  }

  await emitTimeline(admin, {
    entity: 'student', entityId: user.id, kind: 'buddy_assigned',
    summary: 'Session booked', actor: 'student',
    metadata: { sessionId, buddyId: credit.buddy_id, intent: credit.session_intent },
  });

  return NextResponse.json({ ok: true, sessionId, meetUrl: room.meetUrl });
}
