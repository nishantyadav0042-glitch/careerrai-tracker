import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── A HOLD IS NOT A ROOM ────────────────────────────────────────────────────
//
// The permanent room is minted `busy: false` on purpose, so a session a
// student books is invisible on the mentor's own calendar. createCalendarHold
// closes that — but it must do so WITHOUT minting a second Meet room, because
// one-room-per-buddy is what the knock-lobby and the
// no_overlapping_buddy_sessions GiST constraint both rest on.
//
// These tests pin the three properties that make it safe:
//   1. it never sends conferenceData  (no second room, ever)
//   2. it sends transparency 'opaque' (the mentor is actually busy)
//   3. it carries the EXISTING link   (the buddy's permanent room)

const getAccessToken = vi.hoisted(() => vi.fn(async () => 'tok' as string | null));
const audit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('./google-oauth', () => ({ getAccessToken }));
vi.mock('./integration-audit', () => ({ audit }));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);

import { createCalendarHold } from './google-meet';

const START = new Date('2026-08-29T11:00:00.000Z');

/** The JSON body the module actually sent to Google. */
function sentBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string);
}
function sentUrl(): string {
  return (fetchMock.mock.calls[0] as [string, RequestInit])[0];
}

function googleReturns(payload: unknown, status = 200) {
  fetchMock.mockResolvedValue({
    ok: status < 400, status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getAccessToken.mockResolvedValue('tok');
});

describe('createCalendarHold — it must never mint a second room', () => {
  it('sends NO conferenceData', async () => {
    googleReturns({ id: 'evt-1' });
    await createCalendarHold({
      buddyUserId: 'bud-1', title: 'CareerRai 1:1 — Dhruv',
      start: START, durationMinutes: 45, meetLink: 'https://meet.example/permanent',
    });
    expect(sentBody()).not.toHaveProperty('conferenceData');
  });

  it('does not ask Google for a conference in the query string either', async () => {
    googleReturns({ id: 'evt-1' });
    await createCalendarHold({
      buddyUserId: 'bud-1', title: 't', start: START, durationMinutes: 45, meetLink: null,
    });
    expect(sentUrl()).not.toContain('conferenceDataVersion');
  });

  it('carries the buddy’s EXISTING permanent link rather than creating one', async () => {
    googleReturns({ id: 'evt-1' });
    await createCalendarHold({
      buddyUserId: 'bud-1', title: 't', start: START, durationMinutes: 45,
      meetLink: 'https://meet.example/permanent',
    });
    expect(sentBody().description).toContain('https://meet.example/permanent');
  });

  it('still creates the hold when the buddy has no room yet', async () => {
    googleReturns({ id: 'evt-1' });
    const r = await createCalendarHold({
      buddyUserId: 'bud-1', title: 't', start: START, durationMinutes: 45, meetLink: null,
    });
    expect(r).toEqual({ ok: true, eventId: 'evt-1' });
    expect(sentBody().description).not.toContain('Join here');
  });
});

describe('createCalendarHold — the mentor is actually busy', () => {
  it('sends transparency opaque, not transparent', async () => {
    googleReturns({ id: 'evt-1' });
    await createCalendarHold({
      buddyUserId: 'bud-1', title: 't', start: START, durationMinutes: 45, meetLink: null,
    });
    // The anchor room is 'transparent' by design. This must be its opposite —
    // it is the entire reason the function exists.
    expect(sentBody().transparency).toBe('opaque');
  });

  it('blocks exactly the session length', async () => {
    googleReturns({ id: 'evt-1' });
    await createCalendarHold({
      buddyUserId: 'bud-1', title: 't', start: START, durationMinutes: 45, meetLink: null,
    });
    const b = sentBody() as { start: { dateTime: string }; end: { dateTime: string } };
    const mins = (Date.parse(b.end.dateTime) - Date.parse(b.start.dateTime)) / 60_000;
    expect(mins).toBe(45);
  });

  it('names the student in the title the mentor will see', async () => {
    googleReturns({ id: 'evt-1' });
    await createCalendarHold({
      buddyUserId: 'bud-1', title: 'CareerRai 1:1 — Dhruv',
      start: START, durationMinutes: 45, meetLink: null,
    });
    expect(sentBody().summary).toBe('CareerRai 1:1 — Dhruv');
  });
});

describe('createCalendarHold — failure is reported, never invented', () => {
  it('returns not_connected when the mentor has no Google token', async () => {
    getAccessToken.mockResolvedValue(null);
    const r = await createCalendarHold({
      buddyUserId: 'bud-1', title: 't', start: START, durationMinutes: 45, meetLink: null,
    });
    // This is today's EXPECTED answer — google_oauth_tokens is empty in
    // production. It must be a clean typed failure, not a throw.
    expect(r).toMatchObject({ ok: false, reason: 'not_connected' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an event Google created but gave no id — we could never cancel it', async () => {
    googleReturns({ });
    const r = await createCalendarHold({
      buddyUserId: 'bud-1', title: 't', start: START, durationMinutes: 45, meetLink: null,
    });
    expect(r).toMatchObject({ ok: false, reason: 'api_error' });
  });

  it('invites the student only when we actually have an email', async () => {
    googleReturns({ id: 'evt-1' });
    await createCalendarHold({
      buddyUserId: 'bud-1', title: 't', start: START, durationMinutes: 45,
      meetLink: null, studentEmail: null,
    });
    expect(sentBody().attendees).toEqual([]);

    fetchMock.mockClear();
    googleReturns({ id: 'evt-2' });
    await createCalendarHold({
      buddyUserId: 'bud-1', title: 't', start: START, durationMinutes: 45,
      meetLink: null, studentEmail: 'a@b.com',
    });
    expect(sentBody().attendees).toEqual([{ email: 'a@b.com' }]);
  });
});
