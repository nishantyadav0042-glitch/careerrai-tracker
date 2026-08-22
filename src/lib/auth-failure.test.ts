import { describe, it, expect } from 'vitest';
import { classifyAuth, shouldRetryAuth } from './auth-failure';

// The defect this encodes: getUser() resolves `{ user: null, error }` instead
// of throwing, so every auth failure used to look identical to "not logged in"
// and a student with a live session was redirected to /login.

describe('a real user is never in doubt', () => {
  it('any user object is authenticated, error or not', () => {
    expect(classifyAuth({ id: 'u1' }, null)).toBe('authenticated');
    expect(classifyAuth({ id: 'u1' }, { name: 'AuthApiError', status: 500 })).toBe('authenticated');
  });
});

describe('genuinely logged out', () => {
  it('no user and no error is the ordinary logged-out visitor', () => {
    expect(classifyAuth(null, null)).toBe('no-session');
    expect(classifyAuth(null, undefined)).toBe('no-session');
  });

  it('a credential the server saw and rejected is a real answer', () => {
    for (const status of [400, 401, 403]) {
      expect(classifyAuth(null, { name: 'AuthApiError', status })).toBe('no-session');
    }
    expect(classifyAuth(null, { name: 'AuthSessionMissingError', status: 400 })).toBe('no-session');
  });
});

describe('an infrastructure failure is UNKNOWN, never a logout', () => {
  it('auth-js transient fetch errors', () => {
    expect(classifyAuth(null, { name: 'AuthRetryableFetchError', status: 503 })).toBe('infrastructure');
    // Its status may be anything, including a normally-decisive one.
    expect(classifyAuth(null, { name: 'AuthRetryableFetchError', status: 0 })).toBe('infrastructure');
  });

  it('a thrown network error carries no status, and must not read as rejected', () => {
    expect(classifyAuth(null, { name: 'TypeError', message: 'fetch failed' })).toBe('infrastructure');
    expect(classifyAuth(null, { name: 'AuthUnknownError', status: null })).toBe('infrastructure');
  });

  it('the auth service failing is not the session failing', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classifyAuth(null, { name: 'AuthApiError', status })).toBe('infrastructure');
    }
  });

  it('being throttled decides nothing about the session', () => {
    expect(classifyAuth(null, { name: 'AuthApiError', status: 429 })).toBe('infrastructure');
  });
});

describe('retry only where a retry can help', () => {
  it('retries the unknown, never the answered', () => {
    expect(shouldRetryAuth('infrastructure')).toBe(true);
    expect(shouldRetryAuth('no-session')).toBe(false);
    expect(shouldRetryAuth('authenticated')).toBe(false);
  });
});
