import { describe, it, expect, vi, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

// Falling THROUGH the normalisation (the fix) means the request continues into
// proxy's Supabase session refresh, which needs a client and a network. Dummy
// env + a fetch that answers "no session" keep that section inert so these
// tests exercise only the routing decision.
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'stub-anon-key';
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ msg: 'no session' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  )));
});

// ── THE MIDDLEWARE MUST NOT STEAL AN API ROUTE'S OAUTH CODE ─────────────────
//
// Found live, 28 Aug 2026, on the founder's first mentor Google connection.
// proxy.ts normalises Supabase magic-link landings: any url carrying `?code=`
// (or token_hash+type) that is not /auth/callback gets 307'd there. Written
// before /api/google/callback existed, it matched Google's OAuth redirect for
// the mentor calendar flow — /api/google/callback?code=… — and handed the raw
// Google code to /auth/callback, which fed it to Supabase as a PKCE code:
// flow_state_not_found, bounce to /login?error=1. The mentor callback never
// executed; google_oauth_tokens stayed empty; the founder saw a password
// error on a screen he never asked for.
//
// Three independent logs agreed on the diagnosis (Vercel: both routes 307 in
// the same second; GoTrue: the pkce exchange 404s; integration_audit_log: the
// callback's audited branches never ran). The rule now: an /api/* route that
// receives a ?code= IS the handler for that code — the magic-link problem
// this normalisation solves only ever lands on HTML pages.

function req(url: string): NextRequest {
  // Canonical host, so the domain-cutover 308 branch above the code branch
  // does not fire and the test exercises the normalisation itself.
  return new NextRequest(url, { headers: { host: 'careerrai.in' } });
}

describe('the ?code= normalisation', () => {
  it('REGRESSION: leaves /api/google/callback alone — it owns its code', async () => {
    const res = await proxy(req('https://careerrai.in/api/google/callback?code=4%2FGOOGLE_RAW&state=abc'));
    // Falling through the middleware means no redirect to /auth/callback.
    const location = res?.headers.get('location') ?? '';
    expect(location).not.toContain('/auth/callback');
  });

  it('leaves every other /api/ path alone too', async () => {
    const res = await proxy(req('https://careerrai.in/api/anything?code=whatever'));
    expect(res?.headers.get('location') ?? '').not.toContain('/auth/callback');
  });

  it('still normalises a magic-link landing on an HTML page', async () => {
    // The behaviour the block exists for: Supabase emails land on the root.
    const res = await proxy(req('https://careerrai.in/?code=SUPABASE_PKCE_CODE'));
    const location = res?.headers.get('location') ?? '';
    expect(location).toContain('/auth/callback');
    expect(location).toContain('code=SUPABASE_PKCE_CODE');
  });

  it('still normalises token_hash+type landings', async () => {
    const res = await proxy(req('https://careerrai.in/welcome?token_hash=h&type=email'));
    expect(res?.headers.get('location') ?? '').toContain('/auth/callback');
  });
});
