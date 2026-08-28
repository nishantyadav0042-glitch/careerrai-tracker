import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── A GRANT WITHOUT THE CALENDAR SCOPE MUST NOT BECOME A CONNECTION ─────────
//
// Found live on the founder's first connection, 29 Aug 2026: Google's
// granular-consent screen renders the calendar permission as an UNTICKED
// checkbox. Skipping it still completes OAuth successfully — access token,
// refresh token, redirect home — just with no calendar grant. Storing that
// token produces a mentor who is Connected on every screen and bookable by
// decideBookability, whose every calendar call 403s: no hold, no invite,
// nothing to cancel. The token response's `scope` field is the only place the
// truth appears, and exchangeCodeAndStore must read it.

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ upsert: async () => ({ error: null }) }),
  }),
}));

const CALENDAR = 'https://www.googleapis.com/auth/calendar.events';

function googleAnswers(token: Record<string, unknown>) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes('oauth2.googleapis.com/token')) {
      return { ok: true, json: async () => token } as Response;
    }
    // userinfo
    return { ok: true, json: async () => ({ email: 'mentor@careerrai.in' }) } as Response;
  });
}

describe('exchangeCodeAndStore verifies what was GRANTED', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('refuses a healthy-looking token whose scope is missing calendar', async () => {
    // The trap case: access token ✓, refresh token ✓, email resolvable ✓ —
    // ONLY the scope says the checkbox was left unticked.
    vi.stubGlobal('fetch', googleAnswers({
      access_token: 'at', refresh_token: 'rt', expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/userinfo.email openid',
    }));
    const { exchangeCodeAndStore } = await import('./google-oauth');
    const res = await exchangeCodeAndStore('code', 'user-1');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/checkbox|calendar access/i);
  });

  it('stores a grant that includes the calendar scope', async () => {
    vi.stubGlobal('fetch', googleAnswers({
      access_token: 'at', refresh_token: 'rt', expires_in: 3600,
      scope: `${CALENDAR} https://www.googleapis.com/auth/userinfo.email`,
    }));
    const { exchangeCodeAndStore } = await import('./google-oauth');
    const res = await exchangeCodeAndStore('code', 'user-1');
    expect(res).toEqual({ ok: true, email: 'mentor@careerrai.in' });
  });

  it('still refuses a missing refresh token before scopes are even considered', async () => {
    vi.stubGlobal('fetch', googleAnswers({ access_token: 'at', scope: CALENDAR }));
    const { exchangeCodeAndStore } = await import('./google-oauth');
    const res = await exchangeCodeAndStore('code', 'user-1');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/refresh token/i);
  });
});
