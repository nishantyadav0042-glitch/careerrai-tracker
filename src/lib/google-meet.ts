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
