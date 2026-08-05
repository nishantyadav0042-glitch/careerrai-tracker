import { getAccessToken, clearGoogleState } from '@/lib/google-oauth';
import { audit } from '@/lib/integration-audit';

// Everything that talks to Google Calendar.
//
// A Meet link cannot be conjured from nothing — Google only mints one as part
// of a Calendar event, which is why a mentor must connect their account.
// `conferenceDataVersion=1` is the flag that actually creates the conference;
// without it the event saves happily and comes back with NO Meet link at all,
// which is the classic way this integration ships broken.
//
// Every call goes through `calendarFetch`, which turns Google's HTTP statuses
// into a small set of reasons the rest of the app can act on. That matters
// more than it looks: 401 and 429 both "fail", but one means *stop and ask the
// mentor to reconnect* and the other means *try again in a minute*. Treating
// them alike either nags a mentor whose connection is fine, or retries forever
// against a grant that will never work again.

const CALENDAR_EVENTS = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/** Why a Calendar call failed, in terms the caller can act on. */
export type FailureReason =
  | 'not_connected'   // no token at all — ask them to connect
  | 'auth_expired'    // Google rejected us; credentials cleared, ask them to reconnect
  | 'forbidden'       // authenticated but not permitted (scope, policy)
  | 'gone'            // the event no longer exists
  | 'rate_limited'    // back off and retry
  | 'google_down'     // Google's fault, transient
  | 'no_link'         // event created but carries no Meet link
  | 'api_error';      // anything else

export interface Failure { ok: false; reason: FailureReason; error: string; status?: number }

/** The message a mentor should actually see. */
export function messageFor(reason: FailureReason): string {
  switch (reason) {
    case 'not_connected':
      return 'Connect your Google Calendar to schedule sessions.';
    case 'auth_expired':
      return 'Your Google Calendar connection expired. Please reconnect your Google Calendar.';
    case 'forbidden':
      return 'Google refused this request. Please reconnect your Google Calendar and grant calendar access.';
    case 'rate_limited':
      return 'Google is rate-limiting us right now. Try again in a minute.';
    case 'google_down':
      return 'Google Calendar is having trouble. Nothing was saved — try again shortly.';
    case 'gone':
      return 'That calendar event no longer exists in Google Calendar.';
    case 'no_link':
      return 'Google created the event but returned no Meet link. Nothing was saved — please try again.';
    default:
      return "Couldn't reach Google Calendar. Nothing was saved — try again.";
  }
}

/** HTTP status for an API route relaying this failure. */
export function statusFor(reason: FailureReason): number {
  switch (reason) {
    case 'not_connected':
    case 'auth_expired':
      return 428; // Precondition Required — the client must go connect first
    case 'forbidden':
      return 403;
    case 'rate_limited':
      return 429;
    default:
      return 502;
  }
}

/**
 * One authenticated Calendar request, with every failure classified.
 *
 * On 401 the connection is torn down here and now. Google returns 401 when the
 * grant is dead, and a dead grant never recovers — leaving the row in place
 * would mean every future booking makes the same doomed call, and the mentor
 * would never be told to reconnect because the app still believed they were
 * connected.
 */
async function calendarFetch(
  userId: string,
  url: string,
  init: RequestInit,
  context: Record<string, unknown> = {},
): Promise<{ ok: true; res: Response } | Failure> {
  const token = await getAccessToken(userId);
  if (!token) {
    return { ok: false, reason: 'not_connected', error: messageFor('not_connected') };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    // Network-level failure. Nothing reached Google, so nothing changed there
    // and nothing must change here either.
    await audit({ subjectId: userId, action: 'google.api_error', ok: false, detail: { ...context, network: String(e) } });
    return { ok: false, reason: 'google_down', error: `Could not reach Google Calendar: ${String(e)}` };
  }

  if (res.ok) return { ok: true, res };

  const body = await res.text().catch(() => '');
  const reason: FailureReason =
    res.status === 401 ? 'auth_expired'
    : res.status === 403 ? 'forbidden'
    : res.status === 404 || res.status === 410 ? 'gone'
    : res.status === 429 ? 'rate_limited'
    : res.status >= 500 ? 'google_down'
    : 'api_error';

  if (reason === 'auth_expired') {
    // Clears the token AND the permanent room, so the app stops believing it
    // can hand out a link on a calendar it can no longer reach.
    await clearGoogleState(userId, 'google.revoked', { ...context, status: 401 });
  } else {
    await audit({
      subjectId: userId, action: 'google.api_error', ok: false,
      detail: { ...context, status: res.status, body: body.slice(0, 300) },
    });
  }

  return {
    ok: false,
    reason,
    status: res.status,
    error: `${messageFor(reason)} (Google said ${res.status}${body ? `: ${body.slice(0, 200)}` : ''})`,
  };
}

function meetLinkOf(ev: {
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
}): string | null {
  return ev.hangoutLink
    ?? ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri
    ?? null;
}

// ── Create ─────────────────────────────────────────────────────────────────

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
  | { ok: true; meetLink: string; eventId: string; calendarId: string | null; invitedStudent: boolean }
  | Failure;

export async function createGoogleMeet(input: CreateMeetInput): Promise<CreateMeetResult> {
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

  // sendUpdates=all so an invited student actually gets the email.
  const call = await calendarFetch(
    input.buddyUserId,
    `${CALENDAR_EVENTS}?conferenceDataVersion=1&sendUpdates=all`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { op: 'create' },
  );
  if (!call.ok) return call;

  const ev = (await call.res.json()) as {
    id?: string;
    hangoutLink?: string;
    organizer?: { email?: string };
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };
  const meetLink = meetLinkOf(ev);

  if (!meetLink || !ev.id) {
    // The event exists but has no conference — never hand this back as a
    // session. Incident #3: refuse loudly rather than save a dead link.
    return { ok: false, reason: 'no_link', error: messageFor('no_link') };
  }

  return {
    ok: true,
    meetLink,
    eventId: ev.id,
    calendarId: ev.organizer?.email ?? null,
    invitedStudent: attendees.length > 0,
  };
}

// ── Update ─────────────────────────────────────────────────────────────────
//
// PATCH, not delete-and-recreate. That distinction is the whole point: a
// PATCH keeps the SAME event and therefore the SAME Meet link, so a student
// who already has the link does not suddenly need a new one. Recreating would
// mint a second room — which is exactly the shape of Incident #21.
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

export type UpdateMeetResult = { ok: true; meetLink: string | null; eventId: string } | Failure;

export async function updateGoogleMeet(input: UpdateMeetInput): Promise<UpdateMeetResult> {
  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000);
  const body: Record<string, unknown> = {
    start: { dateTime: input.start.toISOString(), timeZone: 'Asia/Kolkata' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
  };
  if (input.title) body.summary = input.title;
  if (input.description) body.description = input.description;

  const call = await calendarFetch(
    input.buddyUserId,
    // conferenceDataVersion=1 so the existing conference is PRESERVED rather
    // than stripped; sendUpdates=all so the attendee is told it moved.
    `${CALENDAR_EVENTS}/${encodeURIComponent(input.eventId)}?conferenceDataVersion=1&sendUpdates=all`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { op: 'update', eventId: input.eventId },
  );
  if (!call.ok) return call;

  const ev = (await call.res.json()) as {
    id?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };
  return { ok: true, meetLink: meetLinkOf(ev), eventId: ev.id ?? input.eventId };
}

// ── Delete ─────────────────────────────────────────────────────────────────
//
// "Already gone" is SUCCESS here, not an error. A cancel whose only failure is
// that the event was deleted by hand in Google would otherwise strand the
// session row as 'scheduled' forever — the student keeps seeing a call that
// nobody is coming to. Deleting is idempotent by intent.

export type DeleteMeetResult = { ok: true; alreadyGone: boolean } | Failure;

export async function deleteGoogleMeet(buddyUserId: string, eventId: string): Promise<DeleteMeetResult> {
  const call = await calendarFetch(
    buddyUserId,
    `${CALENDAR_EVENTS}/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: 'DELETE' },
    { op: 'delete', eventId },
  );

  // 204 deleted · 404 never existed · 410 already deleted — the last two mean
  // "not on the calendar any more", which is all the caller asked for.
  if (!call.ok) {
    return call.reason === 'gone' ? { ok: true, alreadyGone: true } : call;
  }
  return { ok: true, alreadyGone: false };
}
