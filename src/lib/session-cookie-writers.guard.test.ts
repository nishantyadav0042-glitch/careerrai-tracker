import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── Nine places implement the session-cookie contract. None may drop a token ──
//
// Most of the app reads its session through @/lib/supabase/server, which uses
// cookies() and cannot write. Auth routes are different: they must SET cookies
// onto the response, so each builds its own createServerClient with its own
// cookies.setAll. There is no shared helper, so the contract is implemented
// nine times.
//
// That contract has exactly one dangerous way to get wrong, and this repo has
// already paid for it: supabase-ssr calls setAll with ROTATED refresh tokens.
// A setAll that collects them into an array and never writes that array onto
// the response silently discards the rotation — the user's cookie still holds
// the token that was just spent, and they are logged out on their next
// request. It looks like nothing is wrong: no error, no failed test, no log.
// (Task #56, forced re-login, is still an open investigation.)
//
// Consolidating these nine into one helper is the right end state and is NOT
// done here: rewriting auth on a change already carrying two migrations is a
// bad trade. What is done here is making the duplication declared, and making
// the specific defect impossible to reintroduce.

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * Files permitted to build their own cookie-writing Supabase client, each with
 * the reason it cannot use the shared read-only server client.
 */
const COOKIE_WRITERS: Record<string, string> = {
  'src/lib/supabase/server.ts': 'THE CANONICAL ONE. Everything that only needs to READ a session uses this. It is on the list because it is the implementation, not an exception to it — and because a change here changes every consumer at once.',
  'src/app/api/auth/login/route.ts': 'establishes the session — must write the auth cookies onto the response',
  'src/app/api/auth/logout/route.ts': 'clears the session cookies (scope local, this device only)',
  'src/app/api/auth/request-otp/route.ts': 'signInWithOtp may rotate cookies even though no session starts yet',
  'src/app/api/auth/request-phone-otp/route.ts': 'same, for the phone rail',
  'src/app/api/auth/verify-otp/route.ts': 'exchanges the code for a session — writes the cookies',
  'src/app/api/auth/verify-phone-otp/route.ts': 'exchanges the phone OTP for a session',
  'src/app/api/auth/link-phone/request/route.ts': 'stages a phone change on the CALLER\'s live session — getUser() must validate the same cookies updateUser mutates',
  'src/app/api/auth/link-phone/verify/route.ts': 'verifyOtp(type: phone_change) attaches the identity to the live session and can re-issue its cookies',
  'src/app/api/auth/set-password/route.ts': 'password set re-issues the session',
  'src/app/api/install/exchange/route.ts': 'hands a session to the installed app',
  'src/app/auth/callback/route.ts': 'the OAuth/magic-link callback that mints the session',
  'src/proxy.ts': 'the routing proxy (Next middleware) refreshes the session on every request',
};

const writers = routeFiles('src')
  .filter((f) => /createServerClient/.test(strip(readFileSync(f, 'utf8'))));

describe('every cookie-writing session client is declared', () => {
  it('the scan finds them (the guard is a guard)', () => {
    expect(writers.length).toBeGreaterThan(5);
  });

  it('no undeclared file builds its own cookie-writing client', () => {
    const undeclared = writers.filter((f) => !(f in COOKIE_WRITERS));
    expect(
      undeclared,
      'A tenth implementation of the session-cookie contract. Use @/lib/supabase/server if it only needs to READ the session; if it genuinely must write cookies, declare it here with the reason:\n  ' +
        undeclared.join('\n  '),
    ).toEqual([]);
  });

  it('the ledger lists nothing that has since been consolidated', () => {
    const stale = Object.keys(COOKIE_WRITERS).filter((f) => !writers.includes(f));
    expect(stale, `no longer builds its own client — remove:\n  ${stale.join('\n  ')}`).toEqual([]);
  });
});

describe('a rotated refresh token is never collected and then dropped', () => {
  /** setAll bodies that stash cookies into a local array rather than writing them. */
  const deferring = writers
    .map((f) => [f, strip(readFileSync(f, 'utf8'))] as const)
    .map(([f, code]) => {
      const m = code.match(/setAll:\s*\(([^)]*)\)\s*=>([\s\S]{0,300}?)(?:\n\s{6,8}\}|\n\s*\},\n)/);
      const body = m?.[2] ?? '';
      const stash = body.match(/([A-Za-z_$][\w$]*)\s*\.push\s*\(/);
      return { file: f, code, body, stashedIn: stash?.[1] ?? null };
    })
    .filter((w) => w.stashedIn !== null);

  it('finds the deferring implementations', () => {
    expect(deferring.length).toBeGreaterThan(5);
  });

  it.each(deferring)('$file applies what it collected', ({ file, code, stashedIn }) => {
    // Whatever the array is called, it must be read back out and set on a
    // response somewhere in the same file. Collect-and-never-apply is the bug.
    const applied =
      new RegExp(`${stashedIn}\\s*\\.forEach`).test(code) ||
      new RegExp(`of\\s+${stashedIn}\\b`).test(code);
    expect(
      applied,
      `${file} collects rotated auth cookies into \`${stashedIn}\` and never writes them onto the response. ` +
      'supabase-ssr hands rotated refresh tokens to setAll; dropping them logs the user out on their next ' +
      'request, with no error anywhere. This is the forced-relogin shape.',
    ).toBe(true);
    expect(
      /cookies\.set|\.cookies\.set/.test(code),
      `${file} never sets a cookie on any response.`,
    ).toBe(true);
  });

  it('no setAll is a no-op', () => {
    const noops = writers.filter((f) =>
      /setAll:\s*\(\s*[A-Za-z_$]*\s*\)\s*=>\s*\{\s*\}/.test(strip(readFileSync(f, 'utf8'))));
    expect(
      noops,
      'An empty setAll throws away every rotated refresh token supabase-ssr hands it:\n  ' + noops.join('\n  '),
    ).toEqual([]);
  });
});
