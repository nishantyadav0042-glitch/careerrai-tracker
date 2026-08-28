import { describe, it, expect } from 'vitest';
import { SESSION_PRICING } from './plans';
import { readFileSync } from 'node:fs';
import {
  remainingCapacity, rosterCapacity, canSellSession, matchMentor,
  upgradeCreditPaise, SESSION_PRICE_PAISE, CREDIT_WINDOW_DAYS, MAX_SPECIALITIES,
  FINDING_TO_SPECIALITY, type MentorProfile,
} from './session-credit';

// The ₹299 can fail in two directions. Selling a session nobody can deliver
// burns the students most willing to pay us — the worst outcome available.
// Refusing a sale we could have honoured costs one sale. These tests are
// weighted accordingly: almost all of them are about refusing.

const mentor = (o: Partial<MentorProfile> = {}): MentorProfile => ({
  buddyId: 'b1', fullName: 'Shreya', specialities: ['mock_analysis'],
  strongestSection: 'QA', ownWeakestSection: null, attemptNumber: 1,
  weeklyCap: 3, openThisWeek: 0, ...o,
});

describe('capacity refuses rather than guesses', () => {
  it('an UNDECLARED cap is zero, never unlimited', () => {
    // Seven of eight mentors have not declared one. Guessing generously here
    // means a student pays and cannot be seen.
    expect(remainingCapacity(mentor({ weeklyCap: null }))).toBe(0);
    expect(remainingCapacity(mentor({ weeklyCap: 0 }))).toBe(0);
    expect(remainingCapacity(mentor({ weeklyCap: -2 }))).toBe(0);
    expect(remainingCapacity(mentor({ weeklyCap: NaN }))).toBe(0);
  });

  it('counts down as sessions are taken, and never goes negative', () => {
    expect(remainingCapacity(mentor({ weeklyCap: 3, openThisWeek: 1 }))).toBe(2);
    expect(remainingCapacity(mentor({ weeklyCap: 3, openThisWeek: 3 }))).toBe(0);
    expect(remainingCapacity(mentor({ weeklyCap: 3, openThisWeek: 9 }))).toBe(0);
  });

  it('the roster sells only what the roster can honour', () => {
    const roster = [mentor({ weeklyCap: 2 }), mentor({ buddyId: 'b2', weeklyCap: null })];
    expect(rosterCapacity(roster)).toBe(2);
    expect(canSellSession(roster)).toBe(true);
  });

  it('SOLD OUT is a real state — an empty roster sells nothing', () => {
    expect(canSellSession([])).toBe(false);
    expect(canSellSession([mentor({ weeklyCap: 2, openThisWeek: 2 })])).toBe(false);
    expect(canSellSession([mentor({ weeklyCap: null })])).toBe(false);
  });
});

describe('matching explains itself or does not happen', () => {
  it('never assigns a mentor who has no room', () => {
    const full = matchMentor([mentor({ weeklyCap: 1, openThisWeek: 1 })],
      { findingKind: 'mock_plateau', studentWeakSection: 'QA', studentIsRepeater: false });
    expect(full).toBeNull();
  });

  it('prefers the mentor whose speciality answers the finding', () => {
    const m = matchMentor([
      mentor({ buddyId: 'strategy', specialities: ['strategy'] }),
      mentor({ buddyId: 'mocks', specialities: ['mock_analysis'] }),
    ], { findingKind: 'mock_plateau', studentWeakSection: null, studentIsRepeater: false });
    expect(m?.buddyId).toBe('mocks');
    expect(m?.reason).toContain('mock analysis');
  });

  it('shared weakness is stated as the fact it is', () => {
    const m = matchMentor([mentor({ ownWeakestSection: 'VARC' })],
      { findingKind: 'mock_plateau', studentWeakSection: 'VARC', studentIsRepeater: false });
    expect(m?.reason).toContain('struggled with VARC herself');
  });

  it('never claims a second attempt we do not know about', () => {
    const m = matchMentor([mentor({ attemptNumber: null })],
      { findingKind: 'consistency', studentWeakSection: null, studentIsRepeater: true });
    expect(m?.reason).not.toContain('second attempt');
  });

  it('with nothing specific to say, it says the plain true thing', () => {
    // Better than inventing a speciality to justify the assignment.
    const m = matchMentor([mentor({ specialities: [], strongestSection: null })],
      { findingKind: 'consistency', studentWeakSection: 'VARC', studentIsRepeater: false });
    expect(m?.reason).toContain('has room this week');
    expect(m?.reason).not.toContain('specialis');
  });

  it('spreads load so one willing mentor is not buried', () => {
    const m = matchMentor([
      mentor({ buddyId: 'busy', weeklyCap: 3, openThisWeek: 2 }),
      mentor({ buddyId: 'free', weeklyCap: 3, openThisWeek: 0 }),
    ], { findingKind: 'mock_plateau', studentWeakSection: null, studentIsRepeater: false });
    expect(m?.buddyId).toBe('free');
  });

  it('every finding the diagnostic emits has a speciality that answers it', () => {
    // If these two vocabularies drift, matching silently degrades to "whoever
    // is free" — which is what this whole design exists to replace.
    for (const kind of ['mock_plateau', 'mock_drop', 'no_strategy', 'behind_timeline', 'consistency', 'repeating_pattern']) {
      expect(FINDING_TO_SPECIALITY[kind], `no speciality answers ${kind}`).toBeTruthy();
    }
  });
});

describe('the upgrade credit is a discount, never a refund', () => {
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const credit = (o: Partial<{ created_at: string; status: string; amount_paise: number; credited_to_payment_id: string | null }> = {}) =>
    ({ created_at: at(1), status: 'completed', amount_paise: SESSION_PRICE_PAISE, credited_to_payment_id: null, ...o }) as never;

  it('a recent session credits its full value', () => {
    expect(upgradeCreditPaise([credit()])).toBe(SESSION_PRICE_PAISE);
  });

  it('expires after the window', () => {
    expect(upgradeCreditPaise([credit({ created_at: at(CREDIT_WINDOW_DAYS + 1) })])).toBe(0);
    expect(upgradeCreditPaise([credit({ created_at: at(CREDIT_WINDOW_DAYS - 1) })])).toBe(SESSION_PRICE_PAISE);
  });

  it('credits ONE session, not three against one plan', () => {
    expect(upgradeCreditPaise([credit(), credit(), credit()])).toBe(SESSION_PRICE_PAISE);
  });

  it('a credit already spent on an upgrade cannot be spent twice', () => {
    expect(upgradeCreditPaise([credit({ credited_to_payment_id: 'pay_1' })])).toBe(0);
  });

  it('a refunded session credits nothing', () => {
    expect(upgradeCreditPaise([credit({ status: 'refunded' })])).toBe(0);
  });

  it('an unheld session still credits — they paid, delivery is our problem', () => {
    expect(upgradeCreditPaise([credit({ status: 'paid' })])).toBe(SESSION_PRICE_PAISE);
  });
});

describe('the shape of the product', () => {
  it('is one SKU at one price — the diagnosis picks the reason, not the price list', () => {
    expect(SESSION_PRICE_PAISE).toBe(SESSION_PRICING.offerPaise);
  });

  it('caps specialities at two, so specialist means something', () => {
    expect(MAX_SPECIALITIES).toBe(2);
  });
});

describe('the money path treats a session differently from a subscription', () => {
  const src = () => readFileSync('src/lib/activate-payment.ts', 'utf8');

  it('a session NEVER grants premium or a permanent buddy', () => {
    // This is the whole point of the entitlement. If the session ever falls
    // through to grantPremiumAndQueueBuddy we have given away the membership
    // for ₹299 and destroyed the upgrade we built it to feed.
    const s = src();
    const branch = s.indexOf('row.plan === SESSION_PLAN_ID');
    const grant = s.indexOf('await grantPremiumAndQueueBuddy');
    expect(branch, 'no session branch in activatePaidOrder').toBeGreaterThan(-1);
    expect(branch, 'the session branch must return BEFORE the premium grant').toBeLessThan(grant);
    expect(s).toContain('return activateSessionCredit(');
  });

  it('a second webhook delivery cannot mint a second credit', () => {
    // Razorpay retries. Two credits for one payment is one free session.
    const s = src();
    expect(s).toContain("from('session_credits').select('id').eq('payment_id', row.id)");
    expect(s).toContain('if (!existing)');
  });

  it('a failed credit mint fails LOUDLY — the student paid for nothing', () => {
    const s = src();
    expect(s).toContain('SESSION CREDIT MINT FAILED');
    expect(s).toMatch(/creditErr[\s\S]{0,200}return false/);
  });

  it('the finding rides onto the credit, so the mentor opens knowing the problem', () => {
    const s = src();
    expect(s).toContain('finding_kind: row.finding_kind');
    expect(s).toContain('finding_evidence: row.finding_evidence');
  });
});
