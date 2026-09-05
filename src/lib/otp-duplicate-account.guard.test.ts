import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── THE PHONE DOOR MUST NOT FORK AN EXISTING ACCOUNT (Incident #66) ─────────
//
// 5 Sep 2026: a live sales rep's session expired mid-shift. He signed in with
// phone OTP and got a BRAND-NEW account — role 'buddy', dropped into the buddy
// setup wizard. He reported "I can't log in". He could; just never into his own
// account.
//
// Mechanism: a staff account carries its number in `profiles.phone` while
// `auth.users.phone` stays NULL, because nobody ever signed in with it. So
// verifyOtp finds no auth user for that number, creates one, `handle_new_user`
// stamps a 'New User' stub, and the route reads that stub as a first-time
// signup — because it looks `existing` up by `data.user.id` and never asks
// whether the NUMBER already belongs to somebody.
//
// This is Incident #62 (the Google door) wearing different clothes. That
// guard was dead because it tested `!existing`, which the handle_new_user
// trigger makes always false. So the test below pins the two things that
// actually matter: the route looks the phone up on OTHER profiles, and it
// refuses. Anyone deleting either line has to delete this test too.

const ROUTE = 'src/app/api/auth/verify-phone-otp/route.ts';
const src = readFileSync(ROUTE, 'utf8');

describe('phone OTP cannot silently create a duplicate account', () => {
  it('looks the phone up against OTHER profiles, not just the resolved auth id', () => {
    // `.eq('phone', e164)` paired with `.neq('id', data.user.id)` is the whole
    // point: it asks "does this number already belong to someone else?", which
    // is the question the 5 Sep fork got wrong.
    expect(src).toMatch(/\.eq\('phone', e164\)/);
    expect(src).toMatch(/\.neq\('id', data\.user\.id\)/);
  });

  it('refuses with 409 instead of proceeding into signup', () => {
    expect(src).toContain('account_exists_for_phone');
    expect(src).toMatch(/status:\s*409/);
  });

  it('records the block so a silent recurrence is visible', () => {
    // The 5 Sep fork ran for over an hour with nothing recorded anywhere.
    expect(src).toContain('otp_duplicate_account_blocked');
  });

  it('does NOT gate the lookup on `!existing` alone — that is the dead-guard bug', () => {
    // Incident #62's guard never fired because handle_new_user makes `existing`
    // always truthy. The stub case MUST be covered too.
    const guardBlock = src.slice(src.indexOf('THE PHONE DOOR'), src.indexOf('account_exists_for_phone'));
    expect(guardBlock).toContain('isStub || !existing');
  });

  it('the guard runs BEFORE the role branch that picks buddy for a stub', () => {
    // Ordering is the fix. The 5 Sep account was handed role 'buddy' by
    // `wantsBuddy && (isStub || !existing)`; if the guard ran after that, the
    // fork would already have a role and a destination.
    const guardAt = src.indexOf('account_exists_for_phone');
    const roleAt = src.indexOf('wantsBuddy && (isStub || !existing)');
    expect(guardAt).toBeGreaterThan(-1);
    expect(roleAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(roleAt);
  });

  it('does not auto-link accounts on a phone match', () => {
    // Linking on a phone match is how a recycled number becomes account
    // takeover. Refusing is deliberate; a human decides.
    const guardBlock = src.slice(src.indexOf('THE PHONE DOOR'), src.indexOf('account_exists_for_phone'));
    expect(guardBlock).not.toMatch(/update\(\{[^}]*id:/);
  });
});
