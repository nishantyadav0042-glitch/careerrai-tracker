import { describe, it, expect, vi } from 'vitest';
import { logConsentEvent } from './consent-history';

describe('logConsentEvent — append-only, never throws, observes its own failure', () => {
  it('inserts exactly the event type and detail given', async () => {
    const inserted: unknown[] = [];
    const admin = { from: () => ({ insert: async (row: unknown) => { inserted.push(row); return { error: null }; } }) };
    await logConsentEvent(admin, 's1', 'subscription_created', 'browser');
    expect(inserted).toEqual([{ student_id: 's1', event_type: 'subscription_created', detail: 'browser' }]);
  });

  it('detail defaults to null when omitted', async () => {
    const inserted: unknown[] = [];
    const admin = { from: () => ({ insert: async (row: unknown) => { inserted.push(row); return { error: null }; } }) };
    await logConsentEvent(admin, 's1', 'recovery_required');
    expect((inserted[0] as { detail: unknown }).detail).toBeNull();
  });

  it('a DB error is logged, never thrown — logging failure must never break the caller', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = { from: () => ({ insert: async () => ({ error: { message: 'insert failed' } }) }) };
    await expect(logConsentEvent(admin, 's1', 'permission_denied')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('a thrown exception is caught and observed, never propagated', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = { from: () => ({ insert: async () => { throw new Error('connection lost'); } }) };
    await expect(logConsentEvent(admin, 's1', 'recovery_failed', 'x')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
