import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// How the app behaves when Google says no.
//
// Founder ask, 5 Aug: "401/invalid_grant → mark disconnected, clear stored
// credentials, ask them to reconnect. Don't keep retrying forever." And
// separately: 403/404/429/500 must be handled gracefully "without corrupting
// the database."
//
// Those two asks pull in opposite directions, which is the whole point of
// these tests. A dead grant must tear the connection down; a rate limit or a
// Google outage must change NOTHING, because the mentor's setup is fine and
// wiping it would turn a 30-second blip into a support ticket.

const cleared = vi.fn();
const audited = vi.fn();

vi.mock('@/lib/google-oauth', () => ({
  getAccessToken: vi.fn(async (userId: string) => (userId === 'unconnected' ? null : 'tok-123')),
  clearGoogleState: (...args: unknown[]) => { cleared(...args); return Promise.resolve(); },
}));
vi.mock('@/lib/integration-audit', () => ({
  audit: (...args: unknown[]) => { audited(...args); return Promise.resolve(); },
}));

import { createGoogleMeet, updateGoogleMeet, deleteGoogleMeet, statusFor, messageFor } from './google-meet';

const START = new Date('2026-08-10T13:30:00.000Z');
const create = () => createGoogleMeet({ buddyUserId: 'b', title: 't', start: START, durationMinutes: 30 });

function respondWith(status: number, body = '{}') {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));
}

beforeEach(() => { cleared.mockClear(); audited.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

describe('a dead grant is torn down, once', () => {
  it('401 clears the stored credentials AND the permanent room', async () => {
    respondWith(401, '{"error":{"message":"Invalid Credentials"}}');
    const res = await create();

    expect(res).toMatchObject({ ok: false, reason: 'auth_expired' });
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(cleared.mock.calls[0][0]).toBe('b');
    expect(cleared.mock.calls[0][1]).toBe('google.revoked');
  });

  it('tells the mentor exactly what to do', () => {
    expect(messageFor('auth_expired')).toContain('reconnect your Google Calendar');
  });

  it('answers 428 so the client sends them to connect, not to a retry', () => {
    // 428 Precondition Required — "fix your setup first". A 5xx would invite a
    // retry loop against a grant that can never work again.
    expect(statusFor('auth_expired')).toBe(428);
    expect(statusFor('not_connected')).toBe(428);
  });

  it('clears on 401 from update and delete too, not only from create', async () => {
    respondWith(401);
    await updateGoogleMeet({ buddyUserId: 'b', eventId: 'e', start: START, durationMinutes: 30 });
    expect(cleared).toHaveBeenCalledTimes(1);

    cleared.mockClear();
    respondWith(401);
    await deleteGoogleMeet('b', 'e');
    expect(cleared).toHaveBeenCalledTimes(1);
  });
});

describe('a transient failure corrupts nothing', () => {
  // The mentor's setup is FINE in every one of these. Wiping their connection
  // would turn a blip into "why do I have to reconnect Google again?"
  for (const [status, reason] of [[429, 'rate_limited'], [500, 'google_down'], [503, 'google_down'], [400, 'api_error']] as const) {
    it(`${status} → ${reason}, credentials untouched`, async () => {
      respondWith(status, 'transient');
      const res = await create();
      expect(res).toMatchObject({ ok: false, reason });
      expect(cleared).not.toHaveBeenCalled();
    });
  }

  it('403 asks for a reconnect but does NOT clear on its own', async () => {
    // A 403 can be a policy block or a missing scope. Telling them to reconnect
    // is right; destroying a possibly-healthy connection to say it is not.
    respondWith(403, 'insufficientPermissions');
    const res = await create();
    expect(res).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(cleared).not.toHaveBeenCalled();
    expect(statusFor('forbidden')).toBe(403);
  });

  it('a network failure never reports success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));
    const res = await create();
    expect(res).toMatchObject({ ok: false, reason: 'google_down' });
    expect(cleared).not.toHaveBeenCalled();
  });

  it('logs every failure, so a bad night can be reconstructed', async () => {
    respondWith(500);
    await create();
    expect(audited).toHaveBeenCalled();
    expect(audited.mock.calls[0][0]).toMatchObject({ action: 'google.api_error', ok: false });
  });

  it('never logs a response body long enough to hide a token in', async () => {
    respondWith(500, 'x'.repeat(5000));
    await create();
    const detail = audited.mock.calls[0][0].detail as { body: string };
    expect(detail.body.length).toBeLessThanOrEqual(300);
  });
});

describe('deleting is idempotent', () => {
  it('404 and 410 are success — an already-gone event cannot wedge a cancel', async () => {
    for (const status of [404, 410]) {
      respondWith(status);
      expect(await deleteGoogleMeet('b', 'e')).toEqual({ ok: true, alreadyGone: true });
      expect(cleared).not.toHaveBeenCalled();
    }
  });

  it('but a 429 during delete is still a failure', async () => {
    respondWith(429);
    expect(await deleteGoogleMeet('b', 'e')).toMatchObject({ ok: false, reason: 'rate_limited' });
  });
});

describe('an unconnected mentor never reaches Google', () => {
  it('short-circuits before the fetch', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const res = await createGoogleMeet({ buddyUserId: 'unconnected', title: 't', start: START, durationMinutes: 30 });
    expect(res).toMatchObject({ ok: false, reason: 'not_connected' });
    expect(f).not.toHaveBeenCalled();
  });
});
