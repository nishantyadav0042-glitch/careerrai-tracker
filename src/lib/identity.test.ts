import { describe, it, expect } from 'vitest';
import {
  isAnchored,
  decideGoogleArrival,
  planPhoneLink,
  isAnchorExempt,
  requiresPhoneAnchor,
  LINK_PHONE_PATH,
  ANCHOR_EXEMPT_PREFIXES,
} from './identity';

// These are behaviour tests, not source-text checks. Every one of them fails if
// the corresponding rule in identity.ts is inverted, loosened or deleted —
// which is the standard Incident #52 set for this repo after a "guard" that
// only grepped the source let a real bug through.

describe('isAnchored — a phone STRING is not evidence', () => {
  it('accepts a real verification timestamp', () => {
    expect(isAnchored({ phoneVerifiedAt: '2026-08-30T10:00:00Z' })).toBe(true);
  });

  it('rejects null / undefined / missing anchor', () => {
    expect(isAnchored({ phoneVerifiedAt: null })).toBe(false);
    expect(isAnchored({ phoneVerifiedAt: undefined })).toBe(false);
    expect(isAnchored(null)).toBe(false);
    expect(isAnchored(undefined)).toBe(false);
  });

  it('rejects the empty string — the shape a careless default produces', () => {
    expect(isAnchored({ phoneVerifiedAt: '' })).toBe(false);
  });

  // The 54 abandoned signups in production: auth.users.phone set, OTP never
  // confirmed. If anchoring ever regresses to "has a phone string" they all
  // become usable accounts nobody verified.
  it('is not satisfied by anything other than the verification stamp', () => {
    const looksLikeAPhone = { phoneVerifiedAt: null, phone: '+919876543210' } as never;
    expect(isAnchored(looksLikeAPhone)).toBe(false);
  });
});

describe('requiresPhoneAnchor — a gate is a lockout, so scope is the safety property', () => {
  const unanchored = { phoneVerifiedAt: null };
  const anchored = { phoneVerifiedAt: '2026-08-01T00:00:00Z' };

  it('gates an unanchored real student — the whole point', () => {
    expect(requiresPhoneAnchor({ role: 'student', anchor: unanchored })).toBe(true);
  });

  it('never gates an anchored student', () => {
    expect(requiresPhoneAnchor({ role: 'student', anchor: anchored })).toBe(false);
  });

  // appreview@careerrai.in — Apple's reviewer has no Indian SIM. Gating them
  // fails the next App Store submission on a login they cannot complete.
  it('exempts the App Store reviewer and demo logins', () => {
    expect(requiresPhoneAnchor({ role: 'student', isTestAccount: true, anchor: unanchored })).toBe(false);
    expect(requiresPhoneAnchor({ role: 'student', isDemo: true, anchor: unanchored })).toBe(false);
  });

  // Neelam Singh, sales, email door, phone never OTP-confirmed. Locking a
  // working counsellor out of the queue is an outage, not a fix.
  it('exempts non-student roles that are already working', () => {
    for (const role of ['sales', 'buddy', 'admin']) {
      expect(requiresPhoneAnchor({ role, anchor: unanchored })).toBe(false);
    }
  });

  it('treats a missing role as not-a-student rather than gating it', () => {
    expect(requiresPhoneAnchor({ role: null, anchor: unanchored })).toBe(false);
    expect(requiresPhoneAnchor({ role: undefined, anchor: unanchored })).toBe(false);
  });

  // A truthy-ish flag must not be read as an exemption by accident.
  it('only exempts on an explicit true', () => {
    expect(requiresPhoneAnchor({ role: 'student', isTestAccount: false, isDemo: false, anchor: unanchored })).toBe(true);
    expect(requiresPhoneAnchor({ role: 'student', isTestAccount: null, isDemo: null, anchor: unanchored })).toBe(true);
  });
});

describe('decideGoogleArrival', () => {
  it('signs in an account that already has a verified phone', () => {
    expect(
      decideGoogleArrival({
        emailOwnedByAnotherAccount: false,
        profile: { role: 'student', anchor: { phoneVerifiedAt: '2026-08-01T00:00:00Z' } },
      }),
    ).toEqual({ kind: 'sign_in' });
  });

  // THE P0. Two days of production said this was the only outcome Google ever
  // produced, and the old code let it straight into the app.
  it('gates a Google arrival with no verified phone instead of admitting it', () => {
    expect(
      decideGoogleArrival({ emailOwnedByAnotherAccount: false, profile: { role: 'student', anchor: { phoneVerifiedAt: null } } }),
    ).toEqual({ kind: 'gate_link_phone' });
  });

  it('gates when there is no profile anchor at all', () => {
    expect(
      decideGoogleArrival({ emailOwnedByAnotherAccount: false, profile: { role: 'student', anchor: null } }),
    ).toEqual({ kind: 'gate_link_phone' });
  });

  it('refuses when the email belongs to another account', () => {
    expect(
      decideGoogleArrival({
        emailOwnedByAnotherAccount: true,
        profile: { role: 'student', anchor: { phoneVerifiedAt: null } },
      }),
    ).toEqual({ kind: 'refuse_account_exists' });
  });

  // ORDER. If the anchored check were evaluated first, someone else's confirmed
  // account would be signed into rather than refused.
  it('refuses a duplicate email even when that account IS anchored', () => {
    expect(
      decideGoogleArrival({
        emailOwnedByAnotherAccount: true,
        profile: { role: 'student', anchor: { phoneVerifiedAt: '2026-08-01T00:00:00Z' } },
      }),
    ).toEqual({ kind: 'refuse_account_exists' });
  });

  it('never returns a fourth outcome', () => {
    const kinds = new Set<string>();
    for (const dup of [true, false]) {
      for (const v of [null, '2026-08-01T00:00:00Z']) {
        kinds.add(decideGoogleArrival({ emailOwnedByAnotherAccount: dup, profile: { role: 'student', anchor: { phoneVerifiedAt: v } } }).kind);
      }
    }
    expect([...kinds].sort()).toEqual(['gate_link_phone', 'refuse_account_exists', 'sign_in']);
  });
});

describe('planPhoneLink', () => {
  const ME = 'aaaaaaaa-0000-0000-0000-000000000001';
  const SOMEONE_ELSE = 'bbbbbbbb-0000-0000-0000-000000000002';

  it('attaches a free number', () => {
    expect(planPhoneLink({ e164: '+919876543210', ownerAccountId: null, thisAccountId: ME }))
      .toEqual({ kind: 'attach', e164: '+919876543210' });
  });

  it('refuses a number that did not normalise', () => {
    expect(planPhoneLink({ e164: null, ownerAccountId: null, thisAccountId: ME }))
      .toEqual({ kind: 'refuse', reason: 'invalid_phone' });
  });

  // The duplicate-account defence. Auto-merging here would move a real
  // student's streak, plan, buddy and payments onto whoever just proved they
  // hold the SIM.
  it('refuses a number anchored to a different account — never merges', () => {
    expect(planPhoneLink({ e164: '+919876543210', ownerAccountId: SOMEONE_ELSE, thisAccountId: ME }))
      .toEqual({ kind: 'refuse', reason: 'phone_belongs_to_another_account' });
  });

  it('is idempotent: re-linking my own number is not an error', () => {
    expect(planPhoneLink({ e164: '+919876543210', ownerAccountId: ME, thisAccountId: ME }))
      .toEqual({ kind: 'already_anchored', e164: '+919876543210' });
  });

  it('invalid phone wins over ownership — nothing is looked up for a bad number', () => {
    expect(planPhoneLink({ e164: null, ownerAccountId: SOMEONE_ELSE, thisAccountId: ME }))
      .toEqual({ kind: 'refuse', reason: 'invalid_phone' });
  });
});

describe('isAnchorExempt — the gate must be escapable but not porous', () => {
  it('lets the gate page and its API through', () => {
    expect(isAnchorExempt(LINK_PHONE_PATH)).toBe(true);
    expect(isAnchorExempt('/api/auth/link-phone/request')).toBe(true);
    expect(isAnchorExempt('/logout')).toBe(true);
  });

  it('closes every product surface', () => {
    for (const p of ['/student/tracker', '/student', '/buddy/students', '/admin', '/pay/continue']) {
      expect(isAnchorExempt(p)).toBe(false);
    }
  });

  // A prefix list is a security boundary; a stray '/' entry would open
  // everything and read as harmless.
  it('contains no entry that would match every path', () => {
    for (const p of ANCHOR_EXEMPT_PREFIXES) {
      expect(p.length).toBeGreaterThan(1);
      expect(p.startsWith('/')).toBe(true);
    }
    expect(ANCHOR_EXEMPT_PREFIXES).not.toContain('/');
  });
});
