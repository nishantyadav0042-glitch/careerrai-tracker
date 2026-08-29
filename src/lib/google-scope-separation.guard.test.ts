import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';
import { GOOGLE_SCOPES, googleRedirectUri } from './google-oauth';
import { SITE_URL, APP_ORIGINS } from './site';

// ── TWO GOOGLE FEATURES, TWO OAUTH SURFACES, ONE RULE EACH ─────────────────
//
// CareerRai asks Google for two completely different things, and conflating
// them is the failure this file exists to make impossible:
//
//   A. STUDENT IDENTITY — "Continue with Google" on /start's final screen and
//      on /login. Supabase Auth's provider, identity scopes ONLY. A student
//      signing up must never be shown a calendar permission: it is a scarier
//      consent screen than the product needs, it would drag every student into
//      the sensitive-scope verification story, and it grants access we have no
//      use for.
//
//   B. MENTOR CALENDAR — "Connect Google" on /buddy/*. OUR OAuth client,
//      calendar.events, offline access, a refresh token in google_oauth_tokens.
//      Sensitive by Google's classification, and that is correct and expected
//      FOR THIS FEATURE — it is two mentors doing one-time setup, not a
//      student-facing screen.
//
// The separation is currently correct. These guards make it stay correct,
// because the regression is silent: adding one scope string to the login
// component would put a calendar consent screen in front of every new student
// and nothing else in the test suite would notice.

const ROOT = join(__dirname, '..');
const read = (rel: string) => codeOnly(readFileSync(join(ROOT, rel), 'utf8'));

const LOGIN_COMPONENT = 'components/auth/continue-with-google.tsx';
const POST_PAYMENT_COMPONENT = 'components/student/post-payment-google.tsx';
const CALENDAR_AUTHORITY = 'lib/google-oauth.ts';

/** Any Google Calendar scope, however narrow. */
const CALENDAR_SCOPE = /googleapis\.com\/auth\/calendar[a-z.]*/g;

function allSourceFiles(dir = ROOT): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { out.push(...allSourceFiles(p)); continue; }
    if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

// ─── GUARD 1 + 2: login is identity-only, and never Calendar ───────────────

describe('GUARD: Google LOGIN requests identity only', () => {
  it('the login component asks for exactly openid, email, profile', () => {
    const code = read(LOGIN_COMPONENT);
    const declared = code.match(/const SCOPES = '([^']+)'/);
    expect(declared, 'SCOPES declaration moved — update this guard').not.toBeNull();
    expect(declared![1].split(/\s+/).sort()).toEqual(['email', 'openid', 'profile']);
  });

  it('the login component names NO calendar scope', () => {
    expect(read(LOGIN_COMPONENT)).not.toMatch(CALENDAR_SCOPE);
  });

  it('the post-payment prompt names no calendar scope either', () => {
    // It passes no `scopes` at all, taking the provider default (identity).
    // A calendar scope appearing here would ask a student who has just PAID
    // for calendar access, at the least appropriate moment there is.
    expect(read(POST_PAYMENT_COMPONENT)).not.toMatch(CALENDAR_SCOPE);
  });

  it('NO Supabase signInWithOAuth call anywhere requests a calendar scope', () => {
    // The wide net: any future component that signs a student in.
    const offenders: string[] = [];
    for (const file of allSourceFiles()) {
      const code = codeOnly(readFileSync(file, 'utf8'));
      if (!/signInWithOAuth\s*\(/.test(code)) continue;
      if (CALENDAR_SCOPE.test(code)) offenders.push(file.replace(`${ROOT}/`, ''));
      CALENDAR_SCOPE.lastIndex = 0;
    }
    expect(
      offenders,
      'a student sign-in path now requests Google Calendar access:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });
});

// ─── GUARD 3 + 4: one calendar scope authority ─────────────────────────────

describe('GUARD: the Calendar scope has exactly one authority', () => {
  it('lib/google-oauth declares it, and it is the mentor calendar scope', () => {
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/calendar.events');
    // Narrowest that can write an event with a Meet link. If this ever widens
    // to the full `calendar` scope (which also grants sharing and deleting
    // whole calendars) that is a deliberate product decision, not a refactor.
    expect(GOOGLE_SCOPES).not.toMatch(/auth\/calendar\s|auth\/calendar$/);
  });

  it('no other non-test file names a calendar scope', () => {
    const offenders: string[] = [];
    for (const file of allSourceFiles()) {
      const rel = file.replace(`${ROOT}/`, '');
      if (rel === CALENDAR_AUTHORITY) continue;
      const code = codeOnly(readFileSync(file, 'utf8'));
      if (CALENDAR_SCOPE.test(code)) offenders.push(rel);
      CALENDAR_SCOPE.lastIndex = 0;
    }
    expect(
      offenders,
      'a second place now decides Calendar permission:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });
});

// ─── GUARD 5: the redirect URI is ours, never the caller's ─────────────────

describe('GUARD: no client-supplied redirect URI', () => {
  // ── MECHANISM CHANGED 29 AUG, PROPERTY DID NOT ────────────────────────────
  //
  // This used to assert googleRedirectUri took NO argument — "a parameter would
  // be a redirect the caller controls". That was the right property enforced by
  // the bluntest possible means, and it was also the bug: CareerRai serves from
  // two live origins, and always returning to the canonical one stranded every
  // mentor signed in on the other (see google-oauth-origin.guard.test.ts).
  //
  // It now takes an origin, and the property is enforced where it belongs — an
  // ALLOWLIST. What is asserted here is the thing that actually matters: no
  // caller-supplied value can become the redirect URI unless it is one of the
  // two origins we ship.
  it('an arbitrary origin can never become the redirect URI', () => {
    for (const evil of ['https://evil.example', 'http://careerrai.in', '//evil.example', 'javascript:alert(1)']) {
      expect(googleRedirectUri(evil), `${evil} was echoed into the redirect`)
        .toBe(`${SITE_URL}/api/google/callback`);
    }
    expect(googleRedirectUri()).toMatch(/^https:\/\/[^/]+\/api\/google\/callback$/);
  });

  it('only the shipped allowlist is honoured, and it is a closed set', () => {
    for (const origin of APP_ORIGINS) {
      expect(googleRedirectUri(origin)).toBe(`${origin}/api/google/callback`);
    }
    expect(APP_ORIGINS).toHaveLength(2);
  });

  it('the authorization URL builder resolves through the allowlist, not the raw input', () => {
    const code = read(CALENDAR_AUTHORITY);
    const at = code.indexOf('redirect_uri:');
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(at, at + 120)).toMatch(/redirect_uri:\s*googleRedirectUri\(origin\)/);
    // The resolver is the only thing that may turn an origin into a URL.
    expect(code).toMatch(/resolveAppOrigin\(/);
  });
});

// ─── GUARD 6: state validation cannot be bypassed ──────────────────────────

describe('GUARD: the callback validates state before anything else', () => {
  const callback = read('app/api/google/callback/route.ts');

  it('verifies state BEFORE exchanging the code', () => {
    const stateAt = callback.indexOf('verifyOAuthState(');
    const exchangeAt = callback.indexOf('exchangeCodeAndStore(');
    expect(stateAt).toBeGreaterThan(-1);
    expect(exchangeAt).toBeGreaterThan(-1);
    expect(stateAt, 'the code is exchanged before state is checked').toBeLessThan(exchangeAt);
  });

  it('refuses on a state mismatch rather than continuing', () => {
    expect(callback).toMatch(/if\s*\(\s*!stateOk\s*\)/);
  });

  it('clears the one-shot nonce on every exit, so a state cannot be replayed', () => {
    expect(callback).toMatch(/OAUTH_STATE_COOKIE,\s*''/);
  });
});

// ─── GUARD 8: failures are observable, secrets are not ─────────────────────

describe('GUARD: a failed connection is diagnosable without leaking secrets', () => {
  const callback = read('app/api/google/callback/route.ts');

  it('audits every failure stage, not just success', () => {
    for (const stage of ['state', 'consent', 'token_exchange']) {
      expect(callback, `the ${stage} failure is unaudited — a failure nobody can read is one you debug twice`)
        .toContain(`'${stage}'`);
    }
  });

  it('never audits or logs a token, secret or refresh token', () => {
    for (const rel of [CALENDAR_AUTHORITY, 'app/api/google/callback/route.ts']) {
      const code = read(rel);
      for (const m of code.matchAll(/(?:console\.(?:log|error|warn)|audit)\s*\([^;]{0,400}/g)) {
        expect(m[0], `${rel} may be logging a credential`)
          .not.toMatch(/\b(refresh_token|access_token|client_secret|GOOGLE_CLIENT_SECRET)\b/);
      }
    }
  });
});
