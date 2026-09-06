import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EVENT_POLICY } from './event-policy';

// ── A ₹399 BUYER MUST HEAR THAT THEY BOUGHT SOMETHING ───────────────────────
//
// Production, 24 Aug -> 3 Sep: the only session ever bought and assigned
// (Dhruv Vakadia) got zero notifications in the ten minutes after paying.
// activateSessionCredit (lib/activate-payment.ts) minted the credit, the
// chat grant and the mentor assignment, and never told the student any of
// it — grantPremiumAndQueueBuddy (lib/premium.ts) had already closed this
// exact silence for the ₹999/₹2,599 subscriptions on 24 Aug; the session
// path was the one door left dark.
//
// These pin the fix at both ends: the dispatch() call exists inside the
// right function, and event-policy.ts — the live channel authority
// (event-registry-completeness.guard.test.ts fails the build if a
// dispatch()'d type has no policy) — actually declares the type it uses.

const ACTIVATE = readFileSync('src/lib/activate-payment.ts', 'utf8');

/** activateSessionCredit's body only — never the subscription path below it. */
const sessionCreditFn = ACTIVATE.slice(
  ACTIVATE.indexOf('async function activateSessionCredit'),
  ACTIVATE.indexOf('export async function activatePaidOrder'),
);

describe('a paid session tells the student it landed', () => {
  it('activateSessionCredit dispatches a notification', () => {
    expect(sessionCreditFn).toMatch(/dispatch\(\{/);
    expect(sessionCreditFn).toMatch(/type:\s*'session_booked'/);
  });

  it('fires through dispatch(), never the raw transport', () => {
    // The send-boundary guard already forbids importing sendPushToUser
    // outside notification-os.ts; this pins that THIS caller obeys it too,
    // so a future edit cannot "optimise" by reaching the transport directly.
    expect(sessionCreditFn).not.toMatch(/sendPushToUser/);
  });

  it('reads the real notif_prefs, not an empty default', () => {
    // {} as prefs would make dispatch() route through no channels at all —
    // a call that exists but reaches nobody is the same bug with a receipt.
    expect(sessionCreditFn).toMatch(/notif_prefs[\s\S]*eq\('id', row\.student_id\)/);
    expect(sessionCreditFn).toMatch(/prefs:\s*\(notifProfile\?\.notif_prefs/);
  });

  it('the confirmed-mentor and still-matching copy are genuinely different', () => {
    // Not two labels on one sentence — a student who paid and got matched
    // must not read the same hedge as a student still waiting.
    expect(sessionCreditFn).toMatch(/Session booked/);
    expect(sessionCreditFn).toMatch(/Payment received/);
  });

  it('the still-matching copy promises no timeframe', () => {
    // Nothing in this codebase retries an unassigned credit on a schedule
    // (assignBuddyToCredit's own comment: "the credit waits at 'paid' and
    // the founder view can see it waiting"). A fixed "within 24 hours" here
    // would be a claim beyond the evidence — the exact thing this app's
    // language contract (daily-insight-honesty.guard.test.ts, elsewhere)
    // already refuses everywhere else it appears.
    const stillMatching = sessionCreditFn.slice(
      sessionCreditFn.indexOf("We're matching you"),
      sessionCreditFn.indexOf("We're matching you") + 120,
    );
    expect(stillMatching).not.toMatch(/\d+\s*(hour|hr|day)/i);
  });

  it('fires regardless of whether a mentor was actually assigned', () => {
    // The dispatch call must sit AFTER the assignment attempt (so it can
    // read the outcome) but OUTSIDE the `if (fresh?.id)` branch that gates
    // the assignment itself — a payment is real whether or not assignment
    // succeeded, and the confirmation must say so either way.
    const assignBlockEnd = sessionCreditFn.indexOf('mentorAssigned = true;');
    const dispatchCall = sessionCreditFn.indexOf("type: 'session_booked'");
    expect(assignBlockEnd).toBeGreaterThan(-1);
    expect(dispatchCall).toBeGreaterThan(assignBlockEnd);
  });
});

describe('the type it uses is a declared policy, not a silent default', () => {
  it('session_booked has its own entry in EVENT_POLICY', () => {
    expect(EVENT_POLICY.session_booked).toBeDefined();
  });

  it('P0 and urgent — money confirmation bypasses quiet hours, like membership', () => {
    expect(EVENT_POLICY.session_booked.importance).toBe('P0');
    expect(EVENT_POLICY.session_booked.urgent).toBe(true);
  });

  it('reaches push AND whatsapp, the same rails membership uses', () => {
    expect(EVENT_POLICY.session_booked.ladder).toContain('push');
    expect(EVENT_POLICY.session_booked.ladder).toContain('whatsapp');
  });

  it('is transactional — never counted against the one-pitch-a-day commercial budget', () => {
    expect(EVENT_POLICY.session_booked.taxonomy).toBe('transactional');
  });

  it('is NOT in the student daily-nudge budget — a consequence of the student\'s own purchase, not an interruption', async () => {
    const { STUDENT_BUDGET_TYPES, isStudentBudgetType } = await import('./notification-os');
    expect(STUDENT_BUDGET_TYPES).not.toContain('session_booked');
    expect(isStudentBudgetType('session_booked')).toBe(false);
  });
});
