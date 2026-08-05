import { describe, it, expect, vi, beforeEach } from 'vitest';

// The audit log is the likeliest place for a credential to leak by accident:
// someone dumps a Google response into `detail`, and now a refresh token sits
// in a table forever. Two layers stop that — this strips, and a CHECK
// constraint on the table rejects anything that gets past.

const inserted: Record<string, unknown>[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => { inserted.push(row); return { error: null }; },
    }),
  }),
}));

import { audit } from './integration-audit';

beforeEach(() => { inserted.length = 0; });

const lastDetail = () => inserted[0].detail as Record<string, unknown>;

describe('a credential never reaches the log', () => {
  it('strips tokens at the top level', async () => {
    await audit({
      subjectId: 'u1', action: 'google.api_error',
      detail: { status: 401, access_token: 'ya29.SECRET', refresh_token: '1//SECRET', op: 'create' },
    });
    expect(lastDetail()).toEqual({ status: 401, op: 'create' });
  });

  it('strips them when nested, where a careless spread would hide them', async () => {
    await audit({
      subjectId: 'u1', action: 'google.connected',
      detail: { response: { email: 'a@b.com', id_token: 'SECRET', nested: { client_secret: 'SECRET', ok: true } } },
    });
    expect(JSON.stringify(inserted[0])).not.toContain('SECRET');
    expect(lastDetail()).toEqual({ response: { email: 'a@b.com', nested: { ok: true } } });
  });

  it('is case-insensitive — Authorization is not a safe spelling', async () => {
    await audit({ subjectId: 'u1', action: 'google.api_error', detail: { Authorization: 'Bearer SECRET', Code: 'SECRET' } });
    expect(JSON.stringify(inserted[0])).not.toContain('SECRET');
  });

  it('keeps everything that is actually useful for debugging', async () => {
    await audit({
      subjectId: 'u1', action: 'booking.rejected', ok: false,
      detail: { reason: 'buddy_double_booked', studentId: 's1', startTime: '2026-08-10T13:30:00.000Z' },
    });
    expect(lastDetail()).toEqual({ reason: 'buddy_double_booked', studentId: 's1', startTime: '2026-08-10T13:30:00.000Z' });
    expect(inserted[0]).toMatchObject({ subject_id: 'u1', action: 'booking.rejected', ok: false });
  });
});

describe('the actor is recorded', () => {
  it('defaults to the subject when nobody else acted', async () => {
    await audit({ subjectId: 'u1', action: 'google.disconnected' });
    expect(inserted[0]).toMatchObject({ subject_id: 'u1', actor_id: 'u1' });
  });

  it('records an admin acting on someone else', async () => {
    await audit({ subjectId: 'buddy1', actorId: 'admin1', action: 'admin.room_regenerated' });
    expect(inserted[0]).toMatchObject({ subject_id: 'buddy1', actor_id: 'admin1' });
  });

  it('allows a null actor for system/cron work', async () => {
    await audit({ subjectId: 'u1', actorId: null, action: 'google.revoked' });
    expect(inserted[0]).toMatchObject({ actor_id: null });
  });
});

describe('logging never breaks the thing it logs', () => {
  it('swallows a write failure instead of failing the booking', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({ from: () => ({ insert: async () => { throw new Error('db down'); } }) }),
    }));
    await expect(audit({ subjectId: 'u1', action: 'booking.created' })).resolves.toBeUndefined();
  });
});
