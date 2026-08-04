import { describe, it, expect } from 'vitest';
import { sessionsVisibleFrom, isJoinOpen, SESSION_GRACE_MS } from './session-window';

// The exact expression proxy.ts uses to route a logged-out visitor who asked
// for a protected path. Mirrored here (not imported) because proxy.ts needs a
// real NextRequest; the point of these tests is to PIN the truth table so the
// Play-review-critical store path can never be changed by accident.
function loggedOutDestination(opts: {
  pathname: string;
  returning: boolean;   // has a user_role cookie (logged in here before)
  holdBack: boolean;    // store launch while the store funnel is disabled
}): '/login' | '/start' {
  const isStudentPath = opts.pathname.startsWith('/student');
  return (opts.returning || opts.holdBack || !isStudentPath) ? '/login' : '/start';
}

describe('logged-out routing for protected paths', () => {
  // ── The Play-review contract. These four cases MUST NOT change. ──
  it('holds a store launch on /login even for a brand-new arrival', () => {
    // Incident #10: /start dead-ends at an SMS OTP to an Indian mobile that a
    // store reviewer cannot receive. While the store funnel is disabled, every
    // wrapper launch must land on /login, which offers a password.
    expect(loggedOutDestination({ pathname: '/student/tracker', returning: false, holdBack: true }))
      .toBe('/login');
  });

  it('still sends a genuinely new web student into the signup funnel', () => {
    // The whole point of /start: questions first, account last.
    expect(loggedOutDestination({ pathname: '/student/tracker', returning: false, holdBack: false }))
      .toBe('/start');
  });

  it('sends a returning student whose session lapsed to /login, not the funnel', () => {
    expect(loggedOutDestination({ pathname: '/student/tracker', returning: true, holdBack: false }))
      .toBe('/login');
  });

  it('keeps deeper student paths on the same rule', () => {
    expect(loggedOutDestination({ pathname: '/student/buddy', returning: false, holdBack: false }))
      .toBe('/start');
  });

  // ── The 4 Aug lockout: a mentor must never meet the student funnel. ──
  it('sends a logged-out buddy to /login even with no cookie on a new device', () => {
    expect(loggedOutDestination({ pathname: '/buddy/home', returning: false, holdBack: false }))
      .toBe('/login');
  });

  it('sends a logged-out admin to /login, never the student funnel', () => {
    expect(loggedOutDestination({ pathname: '/admin', returning: false, holdBack: false }))
      .toBe('/login');
  });
});

describe('session visibility window (one rule, both sides of the meeting)', () => {
  it('keeps a session visible for a full hour after it starts', () => {
    const now = Date.parse('2026-08-04T16:30:00Z'); // the 22:00 IST orientation
    const cutoff = Date.parse(sessionsVisibleFrom(now));
    // A session scheduled exactly now is still inside the window...
    expect(cutoff).toBeLessThanOrEqual(now);
    // ...and so is one that started 59 minutes ago.
    expect(cutoff).toBeLessThanOrEqual(now - 59 * 60_000);
    // But not one from two hours back.
    expect(cutoff).toBeGreaterThan(now - 2 * 60 * 60_000);
    expect(SESSION_GRACE_MS).toBe(60 * 60 * 1000);
  });

  it('keeps Join open at the start minute and after — the bug that broke the call', () => {
    expect(isJoinOpen(15)).toBe(true);   // 15 min before
    expect(isJoinOpen(0)).toBe(true);    // exactly on time  <- used to fail
    expect(isJoinOpen(-4)).toBe(true);   // 4 min late       <- used to fail
    expect(isJoinOpen(16)).toBe(false);  // too early
  });
});
