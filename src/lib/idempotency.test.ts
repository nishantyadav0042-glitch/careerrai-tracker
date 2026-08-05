import { describe, it, expect, vi, beforeEach } from 'vitest';

// Idempotent booking.
//
// The scenario: a mentor on mobile data taps "Schedule", the response is slow,
// nothing visibly happens, they tap again. Without a key that is two POSTs; the
// constraints refuse the second, and from where they sit the app just told them
// they already have a meeting they never knowingly made.

const store = new Map<string, { status: number; response: Record<string, unknown> }>();
const k = (u: string, e: string, key: string) => `${u}|${e}|${key}`;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const filters: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (col: string, val: string) => { filters[col] = val; return q; },
        maybeSingle: async () => ({
          data: store.get(k(filters.user_id, filters.endpoint, filters.key)) ?? null,
        }),
        upsert: async (row: { key: string; user_id: string; endpoint: string; status: number; response: Record<string, unknown> }) => {
          store.set(k(row.user_id, row.endpoint, row.key), { status: row.status, response: row.response });
          return { error: null };
        },
      };
      return q;
    },
  }),
}));

import { idempotencyKey, replayIdempotent, rememberIdempotent } from './idempotency';

const req = (headers: Record<string, string> = {}) =>
  ({ headers: { get: (h: string) => headers[h.toLowerCase()] ?? null } }) as never;

beforeEach(() => store.clear());

describe('reading the key', () => {
  it('takes the Idempotency-Key header', () => {
    expect(idempotencyKey(req({ 'idempotency-key': 'abc-123' }))).toBe('abc-123');
  });

  it('is null when absent — a client that sends none keeps today\'s behaviour', () => {
    expect(idempotencyKey(req())).toBeNull();
  });

  it('rejects an absurdly long key rather than storing it', () => {
    expect(idempotencyKey(req({ 'idempotency-key': 'x'.repeat(500) }))).toBeNull();
  });
});

describe('a repeat returns the first answer', () => {
  it('replays the stored response instead of booking again', async () => {
    await rememberIdempotent('u1', 'schedule-meeting', 'key-1', 200, { meetingId: 's1', meetLink: 'https://meet.google.com/x' });

    const replay = await replayIdempotent('u1', 'schedule-meeting', 'key-1');
    expect(replay).not.toBeNull();
    expect(replay!.status).toBe(200);
    const body = await replay!.json();
    expect(body).toMatchObject({ meetingId: 's1', meetLink: 'https://meet.google.com/x', idempotentReplay: true });
  });

  it('marks the replay, so a client can tell it did not create anything new', async () => {
    await rememberIdempotent('u1', 'schedule-meeting', 'key-1', 200, { meetingId: 's1' });
    const body = await (await replayIdempotent('u1', 'schedule-meeting', 'key-1'))!.json();
    expect(body.idempotentReplay).toBe(true);
  });

  it('a different key is a different booking', async () => {
    await rememberIdempotent('u1', 'schedule-meeting', 'key-1', 200, { meetingId: 's1' });
    expect(await replayIdempotent('u1', 'schedule-meeting', 'key-2')).toBeNull();
  });

  it('no key means no replay, ever', async () => {
    await rememberIdempotent('u1', 'schedule-meeting', null, 200, { meetingId: 's1' });
    expect(await replayIdempotent('u1', 'schedule-meeting', null)).toBeNull();
  });
});

describe('a key cannot leak across users or endpoints', () => {
  it('another user with the same key gets nothing', async () => {
    // Keys are client-generated. If scoping were by key alone, a guessed or
    // colliding uuid would hand someone another mentor's booking response.
    await rememberIdempotent('u1', 'schedule-meeting', 'shared-key', 200, { meetingId: 'secret' });
    expect(await replayIdempotent('u2', 'schedule-meeting', 'shared-key')).toBeNull();
  });

  it('the same key on a different endpoint is separate', async () => {
    await rememberIdempotent('u1', 'schedule-meeting', 'shared-key', 200, { meetingId: 's1' });
    expect(await replayIdempotent('u1', 'reschedule-meeting', 'shared-key')).toBeNull();
  });
});

describe('failures stay retryable', () => {
  it('does not remember an error response', async () => {
    // If Google was down for that one call, the mentor's second tap must be
    // allowed to actually work — not replay the failure forever.
    await rememberIdempotent('u1', 'schedule-meeting', 'key-1', 502, { error: 'Google Calendar is having trouble.' });
    expect(await replayIdempotent('u1', 'schedule-meeting', 'key-1')).toBeNull();
  });

  it('does not remember a rule violation either', async () => {
    await rememberIdempotent('u1', 'schedule-meeting', 'key-1', 409, { error: 'already have an active meeting' });
    expect(await replayIdempotent('u1', 'schedule-meeting', 'key-1')).toBeNull();
  });
});
