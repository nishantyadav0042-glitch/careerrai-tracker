import { describe, it, expect } from 'vitest';
import { classifyAuth, shouldRetryAuth, resolveAuthWithRetry } from './auth-failure';

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

describe('the retry loop: retry the unknown, never the answered', () => {
  const lookups = (...results: Array<{ user?: unknown; error?: unknown } | Error>) => {
    let i = 0;
    const calls = { n: 0 };
    const fn = async () => {
      calls.n += 1;
      const r = results[Math.min(i++, results.length - 1)];
      if (r instanceof Error) throw r;
      return { user: r.user ?? null, error: (r.error ?? null) as never };
    };
    return { fn, calls };
  };

  it('an authenticated lookup asks exactly once', async () => {
    const { fn, calls } = lookups({ user: { id: 'u1' } });
    const r = await resolveAuthWithRetry(fn);
    expect(r.outcome).toBe('authenticated');
    expect(r.user).toEqual({ id: 'u1' });
    expect(calls.n).toBe(1);
  });

  it('a genuinely unauthenticated request asks exactly once — no wasted retry', async () => {
    const { fn, calls } = lookups({ user: null });
    const r = await resolveAuthWithRetry(fn);
    expect(r.outcome).toBe('no-session');
    expect(calls.n).toBe(1);
  });

  it('a rejected credential is not retried — it would only be rejected again', async () => {
    const { fn, calls } = lookups({ user: null, error: { name: 'AuthApiError', status: 401 } });
    const r = await resolveAuthWithRetry(fn);
    expect(r.outcome).toBe('no-session');
    expect(calls.n).toBe(1);
  });

  it('RETRY SUCCESS: a transient failure followed by a real user resolves authenticated', async () => {
    const { fn, calls } = lookups(
      { user: null, error: { name: 'AuthRetryableFetchError', status: 503 } },
      { user: { id: 'u2' } },
    );
    const r = await resolveAuthWithRetry(fn);
    expect(r.outcome).toBe('authenticated');
    expect(r.user).toEqual({ id: 'u2' });
    expect(calls.n).toBe(2);
  });

  it('RETRY EXHAUSTION: still undetermined after the last attempt stays UNKNOWN, never no-session', async () => {
    const { fn, calls } = lookups({ user: null, error: { name: 'AuthApiError', status: 500 } });
    const r = await resolveAuthWithRetry(fn);
    expect(r.outcome).toBe('infrastructure');
    expect(r.attempts).toBe(2);
    expect(calls.n).toBe(2);
  });

  it('a thrown network error is retried too, and can still recover', async () => {
    const { fn, calls } = lookups(new TypeError('fetch failed'), { user: { id: 'u3' } });
    const r = await resolveAuthWithRetry(fn);
    expect(r.outcome).toBe('authenticated');
    expect(calls.n).toBe(2);
  });

  it('a transient failure that becomes a real rejection ends as no-session, not UNKNOWN', async () => {
    const { fn } = lookups(
      { user: null, error: { name: 'AuthRetryableFetchError', status: 503 } },
      { user: null, error: { name: 'AuthSessionMissingError', status: 400 } },
    );
    expect((await resolveAuthWithRetry(fn)).outcome).toBe('no-session');
  });

  it('the attempt budget is honoured — a dead service cannot multiply round-trips', async () => {
    const { fn, calls } = lookups({ user: null, error: { name: 'AuthRetryableFetchError', status: 503 } });
    await resolveAuthWithRetry(fn, 5);
    expect(calls.n).toBe(5);
  });
});
