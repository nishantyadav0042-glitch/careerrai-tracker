import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureBuddyRoom } from '@/lib/buddy-room';
import { statusFor } from '@/lib/google-meet';
import { audit } from '@/lib/integration-audit';
import { constraintFailure } from '@/lib/booking-constraints';
import { idempotencyKey, replayIdempotent, rememberIdempotent } from '@/lib/idempotency';
import { bookedNotificationBody, sessionNotificationUrl } from '@/lib/session-link';
import { dispatch } from '@/lib/notification-os';
import { holdSessionOnCalendar } from '@/lib/session-calendar';

const ALLOWED_DURATIONS = [20, 30, 45, 60];
const ALLOWED_SESSION_TYPES = ['guidance', 'onboarding', 'review', 'doubt_solving', 'mock_review'] as const;
type SessionType = typeof ALLOWED_SESSION_TYPES[number];

interface ScheduleMeetingRequest {
  /** Optional: the buddy's own link (Meet/Zoom). Used verbatim; skips Daily. */
  meetingLink?: string;
  studentId: string;
  startTime: string; // ISO 8601
  durationMinutes: number;
  title?: string;
  sessionType?: SessionType;
}

// Video provider history:
// - Jitsi: removed — its public server now makes the first participant log in
//   as "moderator", so anonymous links dead-end.
// - Daily.co: removed (5 Aug) — it was never at fault for Incident #21, but
//   the founder chose Meet for familiarity.
// - Google Meet, one PERMANENT room per buddy: the current design. The room is
//   minted once at Google connect, not per booking.
//
// Rule learned the hard way: NEVER hand out a link we can't verify. Refuse the
// booking loudly rather than save a session around a link that only fails at
// meeting time.

/**
 * POST /api/calendar/schedule-meeting
 * Buddy schedules a 1:1 on their permanent Meet room, saves the session, and
 * notifies the student in-app. Refuses if the pair already has a live session,
 * or if it would double-book the buddy.
 */
// ── TELLING THE STUDENT IS NOT PART OF THE BOOKING ──────────────────────────
//
// 27 Aug. This dispatch was a bare `await` inside the route's only try block,
// so a transport failure fell through to the outer catch and answered the
// mentor with 500 "Couldn't create the session" — for a session already
// committed at the insert above. The mentor then retried, hit the
// `session_exists` refusal, and held two contradictory answers about one
// booking. `rememberIdempotent` never ran either, so the replay that exists to
// prevent exactly this was never recorded.
//
// Same rule as sessions/schedule's tellBothParties, and now the same shape:
// NEVER fatal, never silent. The student's phone is not what makes the session
// real — the row is. Guarded by session-booking-notified.guard.test.ts.
async function tellTheStudent(opts: {
  sessionId: string;
  studentId: string;
  buddyFirstName: string;
  istTime: string;
  isOrientation: boolean;
  meetLink: string | null;
  prefs: Record<string, unknown>;
}) {
  try {
    await dispatch({
      userId: opts.studentId,
      type: 'session_scheduled',
      title: opts.isOrientation
        ? `🎯 Free Orientation with ${opts.buddyFirstName}`
        : `📅 Session with ${opts.buddyFirstName}`,
      body: bookedNotificationBody({
        istTime: opts.istTime, isOrientation: opts.isOrientation, meetLink: opts.meetLink,
      }),
      url: sessionNotificationUrl('student'),
      data: {
        sessionId: opts.sessionId,
        meetLink: opts.meetLink,
        sessionType: opts.isOrientation ? 'onboarding' : 'guidance',
      },
      reason: 'Session booked by the buddy — the student holds the join link from second one',
      expectedAction: 'view_session',
      prefs: opts.prefs,
    });
  } catch (err) {
    console.error('[calendar/schedule-meeting] booking notification failed', opts.sessionId, err);
  }
}

// ── A GUIDANCE SESSION IS SOMETHING THE STUDENT PAID FOR ────────────────────
//
// Founder decision, 27 Aug: orientation is free, guidance consumes a credit.
//
// Before this, the mentor path inserted a session and never touched
// session_credits. The student's payment sat 'paid' with video_session_id null
// while the session it bought went ahead — so the ledger said "owed" and the
// calendar said "delivered", and neither knew about the other. That is the
// same class as Incident #31 (a paid student out of the lifecycle with no row
// wrong) and it is invisible by construction: every individual row is valid.
//
// NO SECOND WRITER. book_session_credit() already locks the credit, inserts
// the session, links it and moves the state in one transaction, and writes the
// same eight columns the orientation insert does. p_expected_buddy_id is this
// mentor, so booking against a credit assigned to someone else is refused by
// the database rather than by a check here that can drift out of step with it.
//
// The rule is about ENTITLEMENT, not about price. If the student holds a paid
// credit, the booking must consume it whichever side started the booking —
// otherwise a mentor-initiated booking silently delivers a paid session while
// the ledger still says the student is owed one. If they hold no credit, the
// mentor's free booking is unchanged: there is no entitlement to bypass.
/**
 * What the credit authority decided. `no_credit` is not a failure — it is the
 * answer "this student holds no paid entitlement", and the caller then books
 * the free session the mentor path has always booked.
 */
type CreditBooking =
  | { kind: 'booked'; sessionId: string }
  | { kind: 'already'; sessionId: string }
  | { kind: 'no_credit' }
  | { kind: 'refused'; error: string; reason: string; status: number };

async function bookAgainstCredit(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    buddyId: string;
    studentId: string;
    title: string;
    start: Date;
    durationMinutes: number;
    meetLink: string;
  },
): Promise<CreditBooking> {
  // Same status set as the student's own booking route: booking_blocked is a
  // credit whose mentor cancelled — paid for, undelivered, explicitly
  // rebookable. Leaving it out was half of the stranded payment (Incident #36).
  const { data: credit, error } = await admin
    .from('session_credits')
    .select('id, status, video_session_id')
    .eq('student_id', opts.studentId)
    .in('status', ['paid', 'assigned', 'scheduled', 'booking_blocked'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[calendar/schedule-meeting] credit read failed:', error.message);
    // NOT a fall-through to a free session. "We could not read the ledger" and
    // "this student owns nothing" are different answers, and treating the first
    // as the second gives away a paid session on a dropped connection.
    return {
      kind: 'refused',
      error: "Couldn't check this student's session credit — try again.",
      reason: 'credit_read_failed',
      status: 503,
    };
  }

  // NO APPLICABLE PAID CREDIT. Founder decision, 27 Aug: this is not a
  // refusal. A mentor booking for a student who has not bought a session keeps
  // the behaviour it has always had — a free session — because that is a real
  // and intended part of the product, not an accident. The rule being enforced
  // is narrower than "guidance costs money": a paid entitlement must never be
  // bypassed by the path the booking came in through. Where there is no
  // entitlement there is nothing to bypass.
  if (!credit) return { kind: 'no_credit' };

  const { data: booking, error: rpcError } = await admin.rpc('book_session_credit', {
    p_credit_id: credit.id,
    p_student_id: opts.studentId,
    p_expected_buddy_id: opts.buddyId,
    p_start: opts.start.toISOString(),
    p_duration_minutes: opts.durationMinutes,
    p_meet_url: opts.meetLink,
    p_title: opts.title,
    p_session_type: 'guidance',
  });

  if (rpcError || !booking?.[0]) {
    console.error('[calendar/schedule-meeting] booking failed:', rpcError?.message);
    return {
      kind: 'refused',
      error: "Couldn't save the session — try again.",
      reason: 'booking_failed',
      status: 500,
    };
  }

  const { outcome, session_id: sessionId, detail } = booking[0];

  if (outcome === 'booked') return { kind: 'booked', sessionId: sessionId as string };
  if (outcome === 'already_booked') return { kind: 'already', sessionId: sessionId as string };

  // The two race outcomes have wording that already exists, written for a
  // mentor rather than a student — one module, so the two booking paths cannot
  // describe the same rule differently (lib/booking-constraints).
  if (outcome === 'slot_taken' || outcome === 'session_exists') {
    const refused = constraintFailure(
      { code: outcome === 'slot_taken' ? '23P01' : '23505' }, 'buddy',
    )!;
    return { kind: 'refused', error: refused.message, reason: refused.reason, status: refused.status };
  }

  // unavailable / not_eligible / mentor_changed. `detail` comes from the
  // database guard that refused it and is already a sentence.
  return {
    kind: 'refused',
    error: detail ?? 'That booking is not available.',
    reason: outcome as string,
    status: 409,
  };
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth: caller must be a buddy ─────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: buddy } = await admin
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .single();
    if (!buddy || buddy.role !== 'buddy') {
      return NextResponse.json({ error: 'Only buddies can schedule sessions.' }, { status: 403 });
    }

    // A double tap on a slow connection is one booking, not two. Checked here,
    // before any work, so a replay costs a single indexed read.
    const idemKey = idempotencyKey(request);
    const replay = await replayIdempotent(user.id, 'schedule-meeting', idemKey);
    if (replay) return replay;

    // ── Validate input ───────────────────────────────────────────
    let body: ScheduleMeetingRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const { studentId, startTime, durationMinutes, sessionType = 'guidance' } = body;
    if (!studentId || !startTime || !durationMinutes) {
      return NextResponse.json(
        { error: 'studentId, startTime and durationMinutes are required.' },
        { status: 400 }
      );
    }
    if (!ALLOWED_DURATIONS.includes(durationMinutes)) {
      return NextResponse.json({ error: 'Duration must be 20, 30, 45 or 60 minutes.' }, { status: 400 });
    }
    if (!ALLOWED_SESSION_TYPES.includes(sessionType)) {
      return NextResponse.json({ error: 'Invalid session type.' }, { status: 400 });
    }

    const start = new Date(startTime);
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Invalid start time.' }, { status: 400 });
    }
    if (start.getTime() < Date.now() + 60_000) {
      return NextResponse.json({ error: 'Pick a time in the future.' }, { status: 400 });
    }

    // ── Student must belong to this buddy ────────────────────────
    const { data: student } = await admin
      .from('profiles')
      .select('full_name, buddy_id, free_onboarding_used, email, notif_prefs')
      .eq('id', studentId)
      .single();
    if (!student) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }
    if (student.buddy_id !== user.id) {
      return NextResponse.json({ error: 'This student is not assigned to you.' }, { status: 403 });
    }

    const isOrientation = sessionType === 'onboarding';
    if (isOrientation && student.free_onboarding_used) {
      return NextResponse.json(
        { error: 'This student has already completed their free orientation.' },
        { status: 409 }
      );
    }

    const title = body.title?.trim() || (
      isOrientation
        ? `Free Orientation — CareerRai with ${buddy.full_name.split(' ')[0]}`
        : `CareerRai: ${buddy.full_name.split(' ')[0]} × ${student.full_name.split(' ')[0]}`
    );

    // ── One live session per pair ────────────────────────────────
    // Founder rule, 5 Aug: a pair may have exactly ONE live session. Booking
    // another REFUSES — it does not silently supersede — so the mentor and the
    // student always agree on which call is the call.
    //
    // This check exists for the message. The guarantee comes from the
    // `one_live_session_per_pair` unique index, handled below: two taps in the
    // same second cannot both pass a SELECT, but they cannot both pass the
    // index either.
    const { data: existing } = await admin
      .from('video_sessions')
      .select('id, scheduled_at')
      .eq('buddy_id', user.id)
      .eq('student_id', studentId)
      .in('session_status', ['scheduled', 'active'])
      .maybeSingle();

    if (existing) {
      await audit({
        subjectId: user.id, action: 'booking.rejected', ok: false,
        detail: { reason: 'session_exists', studentId, existingSessionId: existing.id },
      });
      // Same sentence the constraint path produces — one source, so the mentor
      // cannot get two different explanations for one rule.
      const refused = constraintFailure({ code: '23505' }, 'buddy')!;
      return NextResponse.json({
        error: refused.message,
        reason: refused.reason,
        existingSessionId: existing.id,
        existingStartTime: existing.scheduled_at,
      }, { status: refused.status });
    }

    // ── The link: the buddy's ONE permanent room ─────────────────
    // Founder decision, 5 Aug: no new Meet per booking. The room is minted
    // once when a mentor connects Google and reused forever, so their link
    // never changes and a student's saved link never rots. See buddy-room.ts
    // for why the shared room is safe (it rests on the overlap constraint).
    let meetLink: string;

    const manualLink = typeof body.meetingLink === 'string' ? body.meetingLink.trim() : '';
    if (manualLink) {
      // A mentor may still paste their own room (a personal Meet, Zoom).
      if (!/^https:\/\/\S+$/i.test(manualLink)) {
        return NextResponse.json({ error: 'That meeting link does not look like a valid https link.' }, { status: 400 });
      }
      meetLink = manualLink;
    } else {
      // ensureBuddyRoom is the availability check: it verifies the mentor is
      // connected, mints the room if this is their first booking, and detects
      // a reconnect under a different Google account. A booking never gets
      // past here without a link we own on a calendar we can reach.
      const room = await ensureBuddyRoom(user.id);
      if (!room.ok) {
        await audit({
          subjectId: user.id, action: 'booking.rejected', ok: false,
          detail: { reason: room.reason, studentId },
        });
        return NextResponse.json({ error: room.error, reason: room.reason }, { status: statusFor(room.reason) });
      }
      meetLink = room.meetUrl;
    }

    // ── Persist session ──────────────────────────────────────────
    //
    // WHICH WRITER, AND WHY THERE ARE TWO. Founder decision, 27 Aug:
    // orientation is free, a guidance session costs a credit. That is one
    // product rule with two different transactional shapes behind it, so the
    // branch is here rather than inside either writer.
    //
    // Orientation: a direct insert. There is no credit to move, and inventing
    // one so both paths could share a writer would put a ₹0 row in the ledger
    // that every count of "sessions paid for" then has to special-case.
    //
    // Guidance: book_session_credit(). This route used to insert directly for
    // both, and `grep -c session_credits` in this file returned 0 — a mentor
    // could book the session a student had paid for and the credit never knew.
    // The student's payment stayed 'paid' with video_session_id null, so
    // hasOpenSessionCredit() still counted it open and the student could not
    // buy another, while the session they were about to attend belonged to no
    // payment at all.
    //
    // The RPC is not a convenience here, it is the only correct shape: it
    // locks the credit, inserts the session, links it and moves the state in
    // ONE transaction, and it writes the same eight columns this insert does.
    // A second credit-linking path written in TypeScript is Incident #23 (a
    // rule in N places drifts N−1 times) aimed at money.
    let sessionId: string;

    // ORIENTATION never asks. It is the free onboarding session, gated above by
    // free_onboarding_used, and spending a paid credit on it would take payment
    // for the thing we advertise as free.
    const booked: CreditBooking = isOrientation
      ? { kind: 'no_credit' }
      : await bookAgainstCredit(admin, {
          buddyId: user.id,
          studentId,
          title,
          start,
          durationMinutes,
          meetLink,
        });

    if (booked.kind === 'refused') {
      await audit({
        subjectId: user.id, action: 'booking.rejected', ok: false,
        detail: {
          reason: booked.reason, studentId,
          startTime: start.toISOString(), viaCredit: true,
        },
      });
      return NextResponse.json(
        { error: booked.error, reason: booked.reason },
        { status: booked.status },
      );
    }

    // The credit already points at a session: the mentor double-submitted, or
    // the student booked this same credit from their own side a moment ago. The
    // answer is that session, not a second one — and no second notification,
    // because they were told when it was first booked.
    if (booked.kind === 'already') {
      const payload = { success: true, meetingId: booked.sessionId, meetLink, already: true };
      await rememberIdempotent(user.id, 'schedule-meeting', idemKey, 200, payload);
      return NextResponse.json(payload);
    }

    if (booked.kind === 'booked') {
      // book_session_credit() has already written the row AND linked the credit
      // inside one transaction. There is nothing left to insert.
      sessionId = booked.sessionId;
    } else {
      // FREE SESSION — orientation, or a student who holds no paid entitlement.
      // Unchanged from what this route has always done: no credit exists, so
      // there is none to consume and none to bypass.
      const { data: session, error: sessionError } = await admin
        .from('video_sessions')
        .insert({
          buddy_id: user.id,
          student_id: studentId,
          title,
          scheduled_at: start.toISOString(),
          duration_minutes: durationMinutes,
          session_status: 'scheduled',
          session_type: isOrientation ? 'onboarding' : 'guidance',
          google_meet_link: meetLink, // reused as the generic "join link" column
        })
        .select('id')
        .single();

      if (sessionError || !session) {
        // The database is the authority on the booking rules, and it fires on
        // races the SELECT above cannot see. A rule violation is a 409 with a
        // sentence, never a 500 — see lib/booking-constraints.
        const refused = constraintFailure(sessionError, 'buddy');
        if (refused) {
          await audit({
            subjectId: user.id, action: 'booking.rejected', ok: false,
            detail: { reason: refused.reason, studentId, startTime: start.toISOString(), viaConstraint: true },
          });
          return NextResponse.json({ error: refused.message, reason: refused.reason }, { status: refused.status });
        }
        console.error('video_sessions insert failed:', sessionError);
        return NextResponse.json({ error: "Couldn't save the session — try again." }, { status: 500 });
      }

      sessionId = session.id as string;
    }

    // ── Notify student in-app (this is where they get the join link) ──
    const istTime = start.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    // Through dispatch() — Event OS invariant 1 (SESSION_BOOKED, P0
    // transactional). The direct insert this replaces created rows that no
    // transport ever saw: 19 session_scheduled rows, 0 pushes, ever. The
    // student's phone now lights up when push is on; the in-app row (with the
    // join link — the lesson from the two expired sessions) is unchanged.
    await tellTheStudent({
      sessionId,
      studentId,
      buddyFirstName: buddy.full_name.split(' ')[0],
      istTime,
      isOrientation,
      meetLink,
      prefs: (student.notif_prefs as Record<string, unknown>) ?? {},
    });

    // ── AND THE MENTOR'S CALENDAR KNOWS (28 Aug) ─────────────────────────────
    //
    // This route made ZERO Google Calendar calls while its sibling
    // (/api/sessions/schedule) placed a BUSY hold and stored the event id. Same
    // product event, two different outcomes — and the rest of the lifecycle
    // assumes the event exists, since reschedule-meeting moves google_event_id
    // and cancel-meeting deletes it. A mentor-created booking left nothing to
    // move and nothing to delete, and the mentor's own hour never showed as
    // busy, so they could hand the same slot to someone else.
    //
    // Through the ONE authority both paths now share, never a second
    // implementation. Best-effort by design: the session row is already
    // committed and is the source of truth, so a Calendar failure must not undo
    // a booking the mentor has just been told succeeded.
    await holdSessionOnCalendar(admin, {
      sessionId,
      studentId,
      buddyId: user.id,
      startIso: start.toISOString(),
      durationMinutes,
      meetUrl: meetLink,
      // This route already composed a title (orientation vs 1:1) before saving
      // the session; reuse it so the calendar entry and the app agree.
      title,
    });

    await audit({
      subjectId: user.id, action: 'booking.created',
      detail: { sessionId, studentId, startTime: start.toISOString(), durationMinutes, sessionType },
    });

    const payload = { success: true, meetingId: sessionId, meetLink };
    await rememberIdempotent(user.id, 'schedule-meeting', idemKey, 200, payload);

    return NextResponse.json(payload);
  } catch (error) {
    console.error('schedule-meeting error:', error);
    return NextResponse.json({ error: "Couldn't create the session — try again." }, { status: 500 });
  }
}
