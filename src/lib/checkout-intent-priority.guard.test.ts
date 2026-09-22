import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLANS, SESSION_PRICING } from './plans';

// ── A PAYMENT ATTEMPT SINCE THE LAST CALL OUTRANKS THE CALL ─────────────────
//
// Founder, 22 Sep 2026: "are you putting this number one priority in Anshul
// list." The answer was no. Measured that morning: the deck held 132 cards and
// the `checkout_abandoned` lane held ZERO, while ten students had created an
// order in the previous fifteen days and every one of them was owned by
// Anshul with a phone number on file.
//
// Two independent guards in call-queue.ts were doing it:
//
//   1. `if (nextAction != null && !dueNow) continue` — a future promise date
//      deleted the student from the day before any lane logic ran. Anushka
//      said "call me back", was scheduled for 25 Sep, then opened the payment
//      window on the night of the 21st. Invisible for four more days.
//      Divyam's next action is 15 November against a 15 September checkout.
//   2. The lane chain classified by the DISPOSITION OF THE LAST CALL, with
//      `checkout_abandoned` after callback/retry/followup — so it could only
//      fire for a student nobody had ever spoken to. shravan patel opened two
//      payment windows and landed in `retry`, a trimmable lane sitting at its
//      ceiling of 12.
//
// These tests exist because both guards read as correct in isolation. The
// rule they encode — a commitment the student made to US outranks intent we
// merely observed — is right, and stayed right; what changed is that an order
// placed AFTER the conversation is not "intent we merely observed".

const SRC = readFileSync(join(process.cwd(), 'src/lib/call-queue.ts'), 'utf8');

describe('a payment attempt made since the last call re-opens the day', () => {
  it('computes freshness against the last attempt, not against a clock window', () => {
    // A fixed "last 7 days" window would have the same bug with extra steps:
    // it would re-surface an order the counsellor already discussed.
    expect(SRC).toMatch(/const abandonedSinceLastCall\s*=/);
    expect(SRC, 'freshness is relative to the conversation, never to now()')
      .toMatch(/ab\.atIso > lastAttemptIso/);
  });

  it('a future promise date no longer deletes a student who has since tried to pay', () => {
    expect(SRC).toMatch(/if \(nextAction != null && !dueNow && !abandonedSinceLastCall\) continue;/);
  });

  it('nor does having already been called today', () => {
    expect(SRC).toMatch(/if \(attemptedToday && !dueNow && !abandonedSinceLastCall\) continue;/);
  });

  it('but the no-answer age-out is deliberately NOT overridden', () => {
    // The one guard left alone. Arguably it should be — a student capped at
    // six unanswered calls who has since tried to pay is exactly who you want
    // to ring. But the cap is the founder's standing rule and he asked for
    // abandoned checkouts to be prioritised, not for the contact ceiling to be
    // reopened. This asserts the refusal so it stays a decision rather than
    // drifting into an accident.
    expect(SRC).toMatch(/>= MAX_CONSECUTIVE_NO_ANSWER\) continue;/);
    expect(SRC, 'and the reasoning stays next to it').toMatch(/THE AGE-OUT IS NOT OVERRIDDEN/);
  });
});

describe('it is checked before the lanes that classify by the last call', () => {
  const idx = (re: RegExp) => SRC.search(re);

  it('the fresh-intent branch opens the chain', () => {
    const fresh = idx(/if \(abandonedSinceLastCall\) \{/);
    expect(fresh, 'branch must exist').toBeGreaterThan(-1);
    for (const [name, re] of [
      ['callback', /\} else if \(dueNow && status === 'follow_up'\) \{/],
      ['retry',    /\} else if \(dueNow && status === 'no_answer'\) \{/],
      ['followup', /\} else if \(dueNow && status === 'interested'\) \{/],
    ] as const) {
      expect(idx(re), `${name} must be checked AFTER fresh payment intent`).toBeGreaterThan(fresh);
    }
  });

  it('a STALE abandoned order still sits below the promise lanes, unchanged', () => {
    // The original rule survives for orders placed before the last call: the
    // counsellor has already had that conversation, so a promise outranks it.
    const followup = idx(/\} else if \(dueNow && status === 'interested'\) \{/);
    const staleAb = idx(/\} else if \(abandonedBy\.has\(r\.id\)\) \{/);
    expect(staleAb).toBeGreaterThan(followup);
  });

  it('sorts above every promise lane, and fresher intent first', () => {
    expect(SRC).toMatch(/sort = 9_000_000 - Math\.min\(8_000, daysAgoAb\);/);
    // The promise lanes cap out below it: callback is 7M + minutesOverdue,
    // and minutesOverdue is itself capped at 999,999.
    expect(SRC).toMatch(/Math\.min\(999_999, Math\.max\(0, Math\.round\(\(now - nextAction!\) \/ 60_000\)\)\)/);
    expect(SRC).toMatch(/sort = 7_000_000 \+ minutesOverdue\(\);/);
    expect(9_000_000 - 8_000, 'the lane floor must clear the callback ceiling')
      .toBeGreaterThan(7_000_000 + 999_999);
  });

  it('the card says what actually happened, not "retry — no answer"', () => {
    expect(SRC).toContain("dueLabel = 'Tried to pay since your last call'");
    expect(SRC, 'the counsellor must be told the order came after the call')
      .toMatch(/AFTER you last spoke/);
  });
});

describe('the price the card is selling', () => {
  it('Till CAT is ₹1,599, cut from ₹2,599 on 22 Sep 2026', () => {
    expect(PLANS.tillcat.offerPaise).toBe(159900);
    expect(PLANS.tillcat.display).toBe('₹1,599');
  });

  it('monthly and session are untouched by that cut', () => {
    expect(PLANS.monthly.offerPaise).toBe(99900);
    expect(SESSION_PRICING.offerPaise).toBe(39900);
  });

  it('Till CAT now costs less than two months, which is the whole reason', () => {
    // Founder, 22 Sep: "2599 is more amount than per month 999 as CAT is in
    // November end." With roughly two months to the exam the hero plan cost
    // MORE than buying the months it covers. This assertion fails the day that
    // becomes true again.
    expect(PLANS.tillcat.offerPaise).toBeLessThan(PLANS.monthly.offerPaise * 2);
  });

  it('still runs past the exam — the name is a promise about a date', () => {
    expect(PLANS.tillcat.months).toBeGreaterThanOrEqual(4);
  });
});
