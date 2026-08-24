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

  // The DATABASE validates the slot: the availability trigger refuses anything
  // outside the mentor's week or during time off, and the exclusion constraint
  // refuses an overlap. The client's slot list is never trusted.
  const { data: session, error: insertError } = await admin
    .from('video_sessions')
    .insert({
      student_id: user.id,
      buddy_id: credit.buddy_id,
      title: '1:1 session',
      scheduled_at: new Date(startIso).toISOString(),
      duration_minutes: SESSION_MINUTES,
      session_status: 'scheduled',
      session_type: 'guidance',
      google_meet_link: room.meetUrl,
    })
    .select('id')
    .single();

  if (insertError || !session) {
    const refused = constraintFailure(insertError, 'student');
    if (refused) {
      // Somebody took it between the list and the tap. The credit is untouched.
      return NextResponse.json(
        { error: 'That time was just taken. Please choose another.', reason: refused.reason },
        { status: 409 },
      );
    }
    console.error('[sessions/schedule] insert failed:', insertError?.message);
    return NextResponse.json({ error: 'Could not book that time — try again.' }, { status: 500 });
  }

  // Link the credit. The unique index and the coherence trigger make a second
  // link impossible, so a race here loses cleanly rather than double-spending.
  const { error: linkError } = await admin
    .from('session_credits')
    .update({ video_session_id: session.id, status: 'scheduled' })
    .eq('id', credit.id)
    .is('video_session_id', null);

  if (linkError) {
    // The session exists but the credit did not attach. Cancel the orphan
    // rather than leave a session no entitlement paid for.
    console.error('[sessions/schedule] credit link failed:', linkError.message);
    await admin.from('video_sessions')
      .update({ session_status: 'cancelled' })
      .eq('id', session.id).eq('session_status', 'scheduled');
    return NextResponse.json({ error: 'Could not confirm that booking — try again.' }, { status: 500 });
  }

  await emitTimeline(admin, {
    entity: 'student', entityId: user.id, kind: 'buddy_assigned',
    summary: 'Session booked', actor: 'student',
    metadata: { sessionId: session.id, buddyId: credit.buddy_id, intent: credit.session_intent },
  });

  return NextResponse.json({ ok: true, sessionId: session.id, meetUrl: room.meetUrl });
}
