import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fingerprintFor, readDeploymentId, describeReactError } from './client-error-meta';

// ── What a crash report may never carry ─────────────────────────────────────
//
// The reporter runs on every student route and fires while the app is broken —
// exactly when it is most tempting to "just send everything". These pin the
// boundary: enough to identify the BUILD and the BUG, never the person.

const reporter = readFileSync('src/components/crash-reporter.tsx', 'utf8');
const route = readFileSync('src/app/api/client-error/route.ts', 'utf8');

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the reporter never reads anything sensitive', () => {
  const code = strip(reporter);

  it('never touches cookies, storage or credentials', () => {
    expect(code).not.toMatch(/document\.cookie/);
    expect(code).not.toMatch(/localStorage|sessionStorage/);
    expect(code).not.toMatch(/authorization/i);
    expect(code).not.toMatch(/access_token|refresh_token|apiKey|api_key|password/i);
  });

  it('never sends the page the student is looking at', () => {
    // A rendered DOM would carry names, phone numbers and mock scores.
    expect(code).not.toMatch(/document\.body|outerHTML|innerHTML|documentElement\.outerHTML/);
  });

  it('sends the path only, never the query string or hash', () => {
    // location.search can carry tokens from an auth callback.
    expect(code).toMatch(/window\.location\.pathname/);
    expect(code).not.toMatch(/location\.(search|hash|href)/);
  });

  it('the user agent is truncated, not sent whole', () => {
    expect(code).toMatch(/navigator\.userAgent\.slice\(0,\s*\d+\)/);
  });
});

describe('the build identifier is a build identifier, nothing more', () => {
  it('only ever yields a Vercel deployment id', () => {
    expect(readDeploymentId(['https://x/y.js?dpl=dpl_ABC123'])).toBe('dpl_ABC123');
  });

  it('a script URL carrying a credential cannot smuggle it through', () => {
    // The planted value is deliberately NOT shaped like a real provider token:
    // an earlier version used a real Google OAuth token prefix and tripped
    // the repo's own secret scanner — correct behaviour from the scanner, and
    // an avoidable own-goal in a test. What is under test is the extractor's
    // narrowness, and that is independent of which credential is planted.
    const out = readDeploymentId([
      'https://x/y.js?token=PLANTED_CREDENTIAL_VALUE&dpl=dpl_ABC123&session=PLANTED_SESSION_VALUE',
    ]);
    expect(out).toBe('dpl_ABC123');
    expect(out).not.toContain('PLANTED');
  });

  it('no deployment stamp yields null rather than an arbitrary URL fragment', () => {
    expect(readDeploymentId(['https://x/y.js?token=PLANTED_CREDENTIAL_VALUE'])).toBeNull();
  });
});

describe('the fingerprint cannot leak the message it was built from', () => {
  it('a React fingerprint is only the code and the mismatch kind', () => {
    const fp = fingerprintFor(
      'Error: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= user=+919876543210',
      'x.js', 1,
    );
    expect(fp).toBe('react#418:html');
    expect(fp).not.toMatch(/\+?\d{10}/);
  });

  it('a non-React fingerprint blanks digits, so an id in a message cannot survive', () => {
    const fp = fingerprintFor('Failed for student 9876543210', 'x.js', 1);
    expect(fp).not.toContain('9876543210');
  });

  it('React metadata extraction never returns free text from the message', () => {
    const meta = describeReactError('Minified React error #418; visit https://react.dev/errors/418?args[]=HTML secret=abc');
    expect(JSON.stringify(meta)).not.toContain('secret');
    expect(JSON.stringify(meta)).not.toContain('abc');
  });
});

describe('the server bounds what it stores', () => {
  it('every stored string is length-capped', () => {
    for (const field of ['MAX_MESSAGE', 'MAX_STACK']) expect(route).toContain(field);
    expect(route).toMatch(/slice\(0, MAX_MESSAGE\)/);
    expect(route).toMatch(/slice\(0, MAX_STACK\)/);
  });

  it('it stores no field the client did not explicitly send', () => {
    const insert = route.slice(route.indexOf('.insert({'), route.indexOf('});', route.indexOf('.insert({')));
    expect(insert).not.toMatch(/headers|cookie|ip\b|email|phone/i);
  });
});
