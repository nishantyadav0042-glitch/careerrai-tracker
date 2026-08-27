import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateSlots, slotsByDay, type Availability, type BusySpan } from '@/lib/session-slots';
import { mentorBookability, UNBOOKABLE_COPY } from '@/lib/session-assignment';
import { constraintFailure } from '@/lib/booking-constraints';
import { ensureBuddyRoom } from '@/lib/buddy-room';
import { SESSION_MINUTES } from '@/lib/session-credit';
import { emitTimeline } from '@/lib/os/timeline';
import { dispatch } from '@/lib/notification-os';
import { createCalendarHold } from '@/lib/google-meet';
import {
  bookedNotificationBody, buddyBookedNotificationBody, sessionNotificationUrl,
} from '@/lib/session-link';

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
    // booking_blocked BELONGS HERE. It is the state a credit lands in when the
    // mentor cancelled or nobody joined: paid for, not delivered, mentor still
    // attached (rule 8), and explicitly rebookable.
    //
    // Leaving it out was the other half of the stranded ₹299, and the worse
    // half. The release fires, the student is told "your booking is back — pick
    // a new time", and then this filter 404s them with "No session to
    // schedule." No admin surface reads session_credits either, so ops cannot
    // see the queue the credit was put into. We would have been making a
    // promise the product could not keep.
    //
    // Nothing else had to change. book_session_credit() looks the credit up by
    // id with no status filter and clears owner/next_action on success — its
    // own comment says that is "what makes booking_blocked -> scheduled a real
    // recovery rather than a status change with a stale ops queue behind it".
    // The database was ready; this line was the whole gap.
    //
    // assignment_failed is deliberately NOT here: rule 7 says it carries no
    // mentor, and rule 1 requires one before a credit can be scheduled. That
    // is a different recovery and needs a mentor assigned first.
    .in('status', ['paid', 'assigned', 'scheduled', 'booking_blocked'])
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

// ── AND BOTH PEOPLE ARE TOLD (27 Aug) ───────────────────────────────────────
//
// This route booked a session and dispatched NOTHING. Not to the student who
// had just paid ₹299, and not to the mentor whose hour had just been taken.
// The sibling path (/api/calendar/schedule-meeting) has told the student since
// the Event OS cycle; this one — the student's OWN self-serve path — never
// did, so the journey was covered on one side and silent on the other.
//
// The mentor's half is new to the whole codebase: before this, `recipient_type
// 'buddy'` had ZERO dispatch call sites. A student could take a slot and the
// only human who could show up was never informed. 11 of the first 18 sessions
// carry status 'expired' — the state release-stale-sessions writes when the
// hour passed and nobody closed it out. That is correlation on a small sample,
// not proof of cause; it is also the exact failure this silence would produce.
//
// Deliberately through dispatch() and no other path: same type, same URL
// helper, same body module as the sibling route, so the two cannot drift.
// `session_scheduled` is NOT one of the 21 types in
// notifications_once_per_day_per_type (index definition checked in production,
// 27 Aug), so a mentor booked three times in one day is told three times
// rather than once — which is the whole point of telling them.
//
// NEVER fatal. The booking is already committed and the student is holding a
// real slot; failing their request now would be a lie about a session that
// exists. But not silent either — silence here is the defect being fixed.
async function tellBothParties(
  admin: ReturnType<typeof createAdminClient>,
  opts: { sessionId: string; studentId: string; buddyId: string; startIso: string; meetUrl: string | null },
) {
  try {
    const [{ data: student }, { data: buddy }] = await Promise.all([
      admin.from('profiles').select('full_name, notif_prefs').eq('id', opts.studentId).maybeSingle(),
      admin.from('profiles').select('full_name, notif_prefs').eq('id', opts.buddyId).maybeSingle(),
    ]);

    const istTime = new Date(opts.startIso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
    const buddyFirst = ((buddy?.full_name as string | null) ?? 'your buddy').split(' ')[0];

    await dispatch({
      userId: opts.studentId,
      type: 'session_scheduled',
      title: `📅 Session with ${buddyFirst}`,
      body: bookedNotificationBody({
        istTime, isOrientation: false, meetLink: opts.meetUrl, bookedBy: 'student',
      }),
      url: sessionNotificationUrl('student'),
      data: { sessionId: opts.sessionId, meetLink: opts.meetUrl, sessionType: 'guidance' },
      reason: 'The student booked this slot themselves and holds the join link',
      expectedAction: 'view_session',
      prefs: (student?.notif_prefs as Record<string, unknown>) ?? {},
    });

    await dispatch({
      userId: opts.buddyId,
      type: 'session_scheduled',
      title: '📅 New session booked',
      body: buddyBookedNotificationBody({
        istTime,
        studentName: (student?.full_name as string | null) ?? 'A student',
        meetLink: opts.meetUrl,
      }),
      url: sessionNotificationUrl('buddy'),
      data: { sessionId: opts.sessionId, meetLink: opts.meetUrl, sessionType: 'guidance' },
      reason: 'A student took this mentor’s slot — the mentor has to know to show up',
      expectedAction: 'view_session',
      prefs: (buddy?.notif_prefs as Record<string, unknown>) ?? {},
    });
  } catch (err) {
    console.error('[sessions/schedule] booking notification failed', opts.sessionId, err);
  }
}

// ── AND THE MENTOR'S CALENDAR KNOWS (27 Aug) ────────────────────────────────
//
// The permanent room is minted `busy: false` deliberately, so a booked session
// showed up nowhere on the mentor's own Google Calendar. They saw a free hour
// and could give it away. This puts a BUSY hold on it.
//
// A hold, not a room: createCalendarHold sends no conferenceData, so the
// one-room-per-buddy invariant is untouched and the join link in the hold is
// the buddy's existing permanent one.
//
// BEST EFFORT, AND THAT IS DELIBERATE. Zero mentors have connected Google
// (google_oauth_tokens is empty), so today this returns 'not_connected' every
// single time. That must not cost a student a booking they already hold — the
// session exists, the credit is spent, and the app row is the source of truth.
// The DB constraint no_overlapping_buddy_sessions is what actually prevents
// double-booking; the calendar is a courtesy to the human, not a lock.
//
// The event id lands on video_sessions.google_event_id, which cancel-meeting
// and reschedule-meeting ALREADY handle correctly — cancel deletes it only
// when it differs from the buddy's permanent anchor, reschedule moves it. So
// this writes into a contract that already exists rather than inventing one.
async function holdTheMentorsHour(
  admin: ReturnType<typeof createAdminClient>,
  opts: { sessionId: string; studentId: string; buddyId: string; startIso: string; meetUrl: string | null },
) {
  try {
    const [{ data: student }, { data: buddy }] = await Promise.all([
      admin.from('profiles').select('full_name, email').eq('id', opts.studentId).maybeSingle(),
      admin.from('profiles').select('full_name').eq('id', opts.buddyId).maybeSingle(),
    ]);

    const studentFirst = ((student?.full_name as string | null) ?? 'a student').split(' ')[0];
    const hold = await createCalendarHold({
      buddyUserId: opts.buddyId,
      title: `CareerRai 1:1 — ${studentFirst}`,
      start: new Date(opts.startIso),
      durationMinutes: SESSION_MINUTES,
      meetLink: opts.meetUrl,
      studentEmail: (student?.email as string | null) ?? null,
    });

    if (!hold.ok) {
      // not_connected is the EXPECTED answer until a mentor connects Google.
      // Logged at info, not error, so it does not drown the real failures.
      console.log('[sessions/schedule] calendar hold skipped', opts.sessionId, hold.reason);
      return;
    }

    const { error } = await admin
      .from('video_sessions')
      .update({ google_event_id: hold.eventId })
      .eq('id', opts.sessionId);
    if (error) {
      // The hold exists in Google but we cannot address it later. Say so
      // loudly: a cancel will now leave a stale hold on the mentor's calendar.
      console.error('[sessions/schedule] hold created but id not stored', opts.sessionId, hold.eventId, error.message);
    }
  } catch (err) {
    console.error('[sessions/schedule] calendar hold failed', opts.sessionId, err);
  }
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

  await tellBothParties(admin, {
    sessionId: sessionId as string,
    studentId: user.id,
    buddyId: credit.buddy_id,
    startIso,
    meetUrl: room.meetUrl,
  });

  await holdTheMentorsHour(admin, {
    sessionId: sessionId as string,
    studentId: user.id,
    buddyId: credit.buddy_id,
    startIso,
    meetUrl: room.meetUrl,
  });

  return NextResponse.json({ ok: true, sessionId, meetUrl: room.meetUrl });
}
