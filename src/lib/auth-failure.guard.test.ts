import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The middleware cannot be executed here (it needs a live Supabase and an edge
// request), so these pin the INVARIANT rather than the wording: an auth
// outcome we could not determine must not be answered as "logged out".

const proxy = readFileSync('src/proxy.ts', 'utf8');

describe('middleware decides on a classified outcome, not on a bare null user', () => {
  it('the getUser error reaches the decision instead of being dropped', () => {
    // The invariant, not the helper's name: every getUser result must be fed
    // through the classifier, and the error must travel with it. Pinning the
    // symbol was wrong — the retry loop was later extracted and the guard
    // failed on a refactor that changed nothing about the behaviour.
    const call = proxy.slice(proxy.indexOf('supabase.auth.getUser()') - 400, proxy.indexOf('supabase.auth.getUser()') + 200);
    expect(call).toMatch(/error:\s*res\.error/);
    // The old shape — a bare destructure with the error dropped on the floor.
    expect(proxy).not.toMatch(/\(\{\s*data:\s*\{\s*user\s*\}\s*\}\s*=\s*await\s+supabase\.auth\.getUser\(\)\)/);
  });

  it('the outcome the middleware branches on comes from the shared resolver', () => {
    // One authority for "is this student authenticated", shared with the unit
    // tests that prove retry-success and retry-exhaustion.
    expect(proxy).toMatch(/resolveAuthWithRetry\(/);
    expect(proxy).toMatch(/const\s*\{\s*user,\s*outcome\s*\}/);
  });
});

describe('an undetermined outcome is never converted into a logout', () => {
  const infraAt = proxy.indexOf("outcome === 'infrastructure'");
  const loginRedirectAt = proxy.indexOf('isProtected && !user');

  it('the infrastructure branch exists and is decided BEFORE the login redirect', () => {
    expect(infraAt).toBeGreaterThan(-1);
    expect(loginRedirectAt).toBeGreaterThan(-1);
    expect(infraAt).toBeLessThan(loginRedirectAt);
  });

  it('that branch answers 503 and never sends the student to /login', () => {
    const branch = proxy.slice(infraAt, loginRedirectAt);
    expect(branch).toContain('503');
    expect(branch).not.toContain('/login');
  });

  it('it denies access rather than weakening authorization', () => {
    const branch = proxy.slice(infraAt, loginRedirectAt);
    // No pass-through: the request must not continue into a protected page.
    expect(branch).not.toMatch(/return\s+response\s*;/);
    expect(branch).toContain('return new NextResponse(');
  });

  it('and it never leaks the underlying auth error to the student', () => {
    const branch = proxy.slice(infraAt, loginRedirectAt);
    expect(branch).not.toMatch(/error\.message|String\(err\)|JSON\.stringify\(err/);
  });
});
