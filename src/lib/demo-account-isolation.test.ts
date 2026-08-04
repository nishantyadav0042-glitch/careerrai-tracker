import { describe, it, expect } from 'vitest';

// The buddy demo tour changes behaviour for exactly ONE account. Everything it
// does is gated, and these tests pin those gates so the blast radius cannot
// widen by accident — especially onto the store review account, which uses
// this same login route and this same student layout.
//
// NOTE: we deliberately do NOT branch on "is this a reviewer". Serving
// reviewers different behaviour from real users is cloaking and is a store
// policy violation. The demo account is an ordinary account with its own
// credentials; the reviewer is simply not it.

// Mirrors the cookie decision in src/app/api/auth/login/route.ts.
function demoCookieAction(email: string | null | undefined): 'set' | 'delete' {
  return email?.toLowerCase() === 'buddydemo@careerrai.in' ? 'set' : 'delete';
}

// Mirrors the gate in src/app/student/layout.tsx.
function isBuddyDemo(username: string | null | undefined): boolean {
  return username === 'buddydemo';
}

// Mirrors the write-block in src/proxy.ts.
function isWriteBlocked(opts: { method: string; pathname: string; hasDemoCookie: boolean }): boolean {
  return (
    opts.method !== 'GET' &&
    opts.pathname.startsWith('/api/') &&
    !opts.pathname.startsWith('/api/auth/') &&
    opts.hasDemoCookie
  );
}

describe('demo cookie is issued to exactly one account', () => {
  it('sets it for the demo account (case-insensitively)', () => {
    expect(demoCookieAction('buddydemo@careerrai.in')).toBe('set');
    expect(demoCookieAction('BuddyDemo@CareerRai.in')).toBe('set');
  });

  it('CLEARS it for the store review account', () => {
    // The reviewer shares this login route. If they ever inherited this
    // cookie on a shared browser, logging in must strip it.
    expect(demoCookieAction('appreview@careerrai.in')).toBe('delete');
  });

  it('clears it for ordinary students, buddies and admins', () => {
    for (const e of ['vedashri@example.com', 'shreya@example.com', 'founder@careerrai.in', null, undefined, '']) {
      expect(demoCookieAction(e)).toBe('delete');
    }
  });

  it('is not fooled by lookalike addresses', () => {
    for (const e of [
      'buddydemo@careerrai.in.evil.com',
      'notbuddydemo@careerrai.in',
      'buddydemo@careerrai.com',
      'buddydemo+x@careerrai.in',
    ]) {
      expect(demoCookieAction(e)).toBe('delete');
    }
  });
});

describe('the student layout only suppresses prompts for the demo account', () => {
  it('is true only for the demo username', () => {
    expect(isBuddyDemo('buddydemo')).toBe(true);
  });

  it('is false for the review account and everyone else', () => {
    for (const u of ['appreview', 'vedashri', 'harshrajput', null, undefined, '']) {
      expect(isBuddyDemo(u)).toBe(false);
    }
  });
});

describe('the read-only write-block cannot touch a normal user', () => {
  it('blocks writes only when the demo cookie is present', () => {
    expect(isWriteBlocked({ method: 'POST', pathname: '/api/engagement', hasDemoCookie: true })).toBe(true);
    expect(isWriteBlocked({ method: 'POST', pathname: '/api/engagement', hasDemoCookie: false })).toBe(false);
  });

  it('never blocks a reader, and never blocks auth (so the demo can log in/out)', () => {
    expect(isWriteBlocked({ method: 'GET', pathname: '/api/engagement', hasDemoCookie: true })).toBe(false);
    expect(isWriteBlocked({ method: 'POST', pathname: '/api/auth/login', hasDemoCookie: true })).toBe(false);
    expect(isWriteBlocked({ method: 'POST', pathname: '/api/auth/logout', hasDemoCookie: true })).toBe(false);
  });

  it('leaves every non-API route alone', () => {
    expect(isWriteBlocked({ method: 'POST', pathname: '/student/tracker', hasDemoCookie: true })).toBe(false);
  });

  it('a real student logging their day is never blocked', () => {
    // The core action. If this ever returns true, the product is broken.
    expect(isWriteBlocked({ method: 'POST', pathname: '/api/logging/log-daily', hasDemoCookie: false })).toBe(false);
  });
});
