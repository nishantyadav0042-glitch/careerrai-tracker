import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The update/delete half of the Google Meet integration.
//
// These are the two operations that decide whether a session that MOVES stays
// one session. Incident #21 happened because "reschedule" meant "book another
// one" — four live rooms for one pair in one evening. A PATCH keeps the event,
// keeps the link, and cannot fork the room. A DELETE that treats "already
// gone" as failure would strand cancelled sessions as live forever.
//
// The Google call itself is mocked (there is no token in CI and no calendar to
// scribble on); what is pinned here is the request WE build and how each of
// Google's answers is interpreted.

vi.mock('@/lib/google-oauth', () => ({
  getAccessToken: vi.fn(async (userId: string) => (userId === 'unconnected' ? null : 'tok-123')),
}));

import { updateGoogleMeet, deleteGoogleMeet } from './google-meet';

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: unknown, init: unknown) =>
    impl(String(url), (init ?? {}) as RequestInit));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const START = new Date('2026-08-10T13:30:00.000Z');

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('updateGoogleMeet — moving a session, not replacing it', () => {
  it('PATCHes the existing event and keeps its Meet link', async () => {
    const f = mockFetch(() => json({ id: 'ev-1', hangoutLink: 'https://meet.google.com/abc-defg-hij' }));

    const res = await updateGoogleMeet({
      buddyUserId: 'buddy-1', eventId: 'ev-1', start: START, durationMinutes: 45, title: 'CareerRai 1:1',
    });

    expect(res).toEqual({ ok: true, eventId: 'ev-1', meetLink: 'https://meet.google.com/abc-defg-hij' });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(url).toContain('/events/ev-1');
  });

  it('preserves the conference and tells the attendee it moved', async () => {
    // Both query params are load-bearing. Without conferenceDataVersion=1 the
    // PATCH can strip the Meet off the event; without sendUpdates=all the
    // student is never told the time changed.
    const f = mockFetch(() => json({ id: 'ev-1', hangoutLink: 'https://meet.google.com/x' }));
    await updateGoogleMeet({ buddyUserId: 'b', eventId: 'ev-1', start: START, durationMinutes: 30 });

    const url = String((f.mock.calls[0] as [string, RequestInit])[0]);
    expect(url).toContain('conferenceDataVersion=1');
    expect(url).toContain('sendUpdates=all');
  });

  it('always sends start AND end, with end derived from the duration', async () => {
    const f = mockFetch(() => json({ id: 'ev-1', hangoutLink: 'https://meet.google.com/x' }));
    await updateGoogleMeet({ buddyUserId: 'b', eventId: 'ev-1', start: START, durationMinutes: 45 });

    const body = JSON.parse(String((f.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.start.dateTime).toBe(START.toISOString());
    expect(body.end.dateTime).toBe(new Date(START.getTime() + 45 * 60_000).toISOString());
    expect(body.start.timeZone).toBe('Asia/Kolkata');
  });

  it('omits summary when no title is given, so a PATCH cannot blank the event', async () => {
    const f = mockFetch(() => json({ id: 'ev-1', hangoutLink: 'https://meet.google.com/x' }));
    await updateGoogleMeet({ buddyUserId: 'b', eventId: 'ev-1', start: START, durationMinutes: 30 });

    const body = JSON.parse(String((f.mock.calls[0] as [string, RequestInit])[1].body));
    expect('summary' in body).toBe(false);
  });

  it('reads the Meet link out of conferenceData when hangoutLink is absent', async () => {
    mockFetch(() => json({
      id: 'ev-1',
      conferenceData: { entryPoints: [
        { entryPointType: 'phone', uri: 'tel:+911234' },
        { entryPointType: 'video', uri: 'https://meet.google.com/zzz-zzzz-zzz' },
      ] },
    }));
    const res = await updateGoogleMeet({ buddyUserId: 'b', eventId: 'ev-1', start: START, durationMinutes: 30 });
    expect(res).toMatchObject({ ok: true, meetLink: 'https://meet.google.com/zzz-zzzz-zzz' });
  });

  it('reports "gone" for 404/410 so the caller can remake instead of failing', async () => {
    for (const status of [404, 410]) {
      mockFetch(() => json({ error: { message: 'Not Found' } }, status));
      const res = await updateGoogleMeet({ buddyUserId: 'b', eventId: 'ev-1', start: START, durationMinutes: 30 });
      expect(res).toMatchObject({ ok: false, reason: 'gone' });
    }
  });

  it('refuses when the mentor is not connected — no silent no-op', async () => {
    const f = mockFetch(() => json({}));
    const res = await updateGoogleMeet({ buddyUserId: 'unconnected', eventId: 'ev-1', start: START, durationMinutes: 30 });
    expect(res).toMatchObject({ ok: false, reason: 'not_connected' });
    expect(f).not.toHaveBeenCalled();
  });

  it('surfaces the real status and body on an API error', async () => {
    mockFetch(() => new Response('start time must be before end time', { status: 400 }));
    const res = await updateGoogleMeet({ buddyUserId: 'b', eventId: 'ev-1', start: START, durationMinutes: 30 });
    expect(res).toMatchObject({ ok: false, reason: 'api_error' });
    if (!res.ok) {
      expect(res.error).toContain('400');
      expect(res.error).toContain('start time must be before end time');
    }
  });

  it('turns a network failure into an error, never a fake success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));
    const res = await updateGoogleMeet({ buddyUserId: 'b', eventId: 'ev-1', start: START, durationMinutes: 30 });
    expect(res).toMatchObject({ ok: false, reason: 'api_error' });
  });
});

describe('deleteGoogleMeet — cancelling for real', () => {
  it('DELETEs the event and notifies the attendee', async () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    const res = await deleteGoogleMeet('buddy-1', 'ev-1');

    expect(res).toEqual({ ok: true, alreadyGone: false });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(url).toContain('/events/ev-1');
    expect(url).toContain('sendUpdates=all');
  });

  it('treats an already-deleted event as success', async () => {
    // Otherwise a mentor who tidied their calendar by hand can never cancel the
    // session in the app — and the student keeps seeing a call nobody attends.
    for (const status of [404, 410]) {
      mockFetch(() => json({ error: { message: 'deleted' } }, status));
      expect(await deleteGoogleMeet('b', 'ev-1')).toEqual({ ok: true, alreadyGone: true });
    }
  });

  it('does not swallow a genuine failure', async () => {
    mockFetch(() => new Response('Rate Limit Exceeded', { status: 403 }));
    const res = await deleteGoogleMeet('b', 'ev-1');
    expect(res).toMatchObject({ ok: false, reason: 'api_error' });
    if (!res.ok) expect(res.error).toContain('403');
  });

  it('refuses when the mentor is not connected', async () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    expect(await deleteGoogleMeet('unconnected', 'ev-1')).toMatchObject({ ok: false, reason: 'not_connected' });
    expect(f).not.toHaveBeenCalled();
  });

  it('escapes the event id into the path', async () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    await deleteGoogleMeet('b', 'ev/../../hax');
    expect(String((f.mock.calls[0] as [string, RequestInit])[0])).toContain('ev%2F..%2F..%2Fhax');
  });
});
