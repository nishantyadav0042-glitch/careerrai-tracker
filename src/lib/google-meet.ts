import { getAccessToken } from '@/lib/google-oauth';

// Creates the real Google Meet for a session, on the MENTOR's calendar.
//
// A Meet link cannot be conjured from nothing — Google only mints one as part
// of a Calendar event, which is why the mentor must have connected their
// account. `conferenceDataVersion=1` is the flag that actually creates the
// conference; without it the event saves happily and comes back with NO Meet
// link at all, which is the classic way this integration ships broken.
//
// The student is added as an attendee only when we know their email. Phone
// signups have none, and that must never block the session — they receive the
// link in-app exactly as before.

const CALENDAR_EVENTS = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface CreateMeetInput {
  buddyUserId: string;
  title: string;
  description?: string;
  start: Date;
  durationMinutes: number;
  /** Student's email, when we have one. Absent for phone-only signups. */
  studentEmail?: string | null;
  /**
   * Whether the event blocks the mentor's availability. Default true.
   * A buddy's permanent room is an anchor for a link, not a commitment — it
   * must not make them look busy for an hour a year from now.
   */
  busy?: boolean;
}

export type CreateMeetResult =
  | { ok: true; meetLink: string; eventId: string; invitedStudent: boolean }
  | { ok: false; reason: 'not_connected' | 'no_link' | 'api_error'; error: string };

export async function createGoogleMeet(input: CreateMeetInput): Promise<CreateMeetResult> {
  const token = await getAccessToken(input.buddyUserId);
  if (!token) {
    return {
      ok: false, reason: 'not_connected',
      error: 'Your Google account is not connected (or access was revoked). Reconnect it to schedule sessions.',
    };
  }

  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000);
  const attendees = input.studentEmail ? [{ email: input.studentEmail }] : [];

  const body = {
    summary: input.title,
    description: input.description ?? 'CareerRai 1:1 session.',
    start: { dateTime: input.start.toISOString(), timeZone: 'Asia/Kolkata' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
    attendees,
    // The request id only needs to be unique per event; Google echoes the
    // created conference back on the response.
    conferenceData: {
      createRequest: {
        requestId: `cr-${input.buddyUserId.slice(0, 8)}-${input.start.getTime()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: { useDefault: true },
    transparency: input.busy === false ? 'transparent' : 'opaque',
  };

  let res: Response;
  try {
    res = await fetch(
      // sendUpdates=all so an invited student actually gets the email.
      `${CALENDAR_EVENTS}?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    return { ok: false, reason: 'api_error', error: `Could not reach Google Calendar: ${String(e)}` };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, reason: 'api_error', error: `Google Calendar refused the event (${res.status}). ${detail.slice(0, 200)}` };
  }

  const ev = (await res.json()) as {
    id?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };

  const meetLink =
    ev.hangoutLink ??
    ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ??
    null;

  if (!meetLink || !ev.id) {
    // The event exists but has no conference — never hand this back as a
    // session. Incident #3: refuse loudly rather than save a dead link.
    return {
      ok: false, reason: 'no_link',
      error: 'Google created the calendar event but returned no Meet link. Nothing was saved — please try again.',
    };
  }

  return { ok: true, meetLink, eventId: ev.id, invitedStudent: attendees.length > 0 };
}

// ── Move an existing session ────────────────────────────────────────────────
//
// PATCH, not delete-and-recreate. That distinction is the whole point: a
// PATCH keeps the SAME event and therefore the SAME Meet link, so a student
// who already has the link in their calendar, their chat and their push
// history does not suddenly need a new one. Recreating would mint a second
// room — which is exactly the shape of Incident #21.
//
// Google's PATCH is a merge: fields we omit are left untouched. We always send
// start AND end together, because sending only one is how you get an event
// that ends before it starts (Google rejects it with a 400 you then have to
// decode at 11pm).

export interface UpdateMeetInput {
  buddyUserId: string;
  eventId: string;
  start: Date;
  durationMinutes: number;
  title?: string;
  description?: string;
}

export type UpdateMeetResult =
  | { ok: true; meetLink: string | null; eventId: string }
  | { ok: false; reason: 'not_connected' | 'gone' | 'api_error'; error: string };

export async function updateGoogleMeet(input: UpdateMeetInput): Promise<UpdateMeetResult> {
  const token = await getAccessToken(input.buddyUserId);
  if (!token) {
    return {
      ok: false, reason: 'not_connected',
      error: 'Your Google account is not connected (or access was revoked). Reconnect it to move this session.',
    };
  }

  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000);
  const body: Record<string, unknown> = {
    start: { dateTime: input.start.toISOString(), timeZone: 'Asia/Kolkata' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
  };
  if (input.title) body.summary = input.title;
  if (input.description) body.description = input.description;

  let res: Response;
  try {
    res = await fetch(
      // conferenceDataVersion=1 so the existing conference is PRESERVED rather
      // than stripped; sendUpdates=all so the attendee is told it moved.
      `${CALENDAR_EVENTS}/${encodeURIComponent(input.eventId)}?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    return { ok: false, reason: 'api_error', error: `Could not reach Google Calendar: ${String(e)}` };
  }

  if (res.status === 404 || res.status === 410) {
    // Someone deleted it inside Google. The caller decides what that means —
    // for a reschedule it means "make a new one", not "fail".
    return { ok: false, reason: 'gone', error: 'That calendar event no longer exists in Google Calendar.' };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, reason: 'api_error', error: `Google Calendar refused the update (${res.status}). ${detail.slice(0, 200)}` };
  }

  const ev = (await res.json()) as {
    id?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };
  const meetLink =
    ev.hangoutLink ??
    ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ??
    null;

  return { ok: true, meetLink, eventId: ev.id ?? input.eventId };
}

// ── Remove a session from the calendar ──────────────────────────────────────
//
// "Already gone" is SUCCESS here, not an error. A cancel whose only failure is
// that the event was deleted by hand in Google would otherwise strand the
// session row as 'scheduled' forever — the student keeps seeing a call that
// nobody is coming to. Deleting is idempotent by intent.

export type DeleteMeetResult =
  | { ok: true; alreadyGone: boolean }
  | { ok: false; reason: 'not_connected' | 'api_error'; error: string };

export async function deleteGoogleMeet(
  buddyUserId: string,
  eventId: string,
): Promise<DeleteMeetResult> {
  const token = await getAccessToken(buddyUserId);
  if (!token) {
    return {
      ok: false, reason: 'not_connected',
      error: 'Your Google account is not connected (or access was revoked).',
    };
  }

  let res: Response;
  try {
    res = await fetch(
      `${CALENDAR_EVENTS}/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (e) {
    return { ok: false, reason: 'api_error', error: `Could not reach Google Calendar: ${String(e)}` };
  }

  // 204 deleted · 404 never existed · 410 already deleted — all mean "not on
  // the calendar any more", which is all the caller asked for.
  if (res.status === 404 || res.status === 410) return { ok: true, alreadyGone: true };
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, reason: 'api_error', error: `Google Calendar refused the delete (${res.status}). ${detail.slice(0, 200)}` };
  }
  return { ok: true, alreadyGone: false };
}
