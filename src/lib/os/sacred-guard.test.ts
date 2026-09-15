import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { escalationChannel, SELF_HEAL_WINDOW_MIN, BUDDY_SLA_HOURS } from './sacred-guard';

// "Every paid student is sacred." These hold the guard to the founder's rules:
// self-heal first, escalate only on failure, money and a face never a count.

describe('the escalation model matches the founder rule', () => {
  it('critical interrupts, high batches', () => {
    expect(escalationChannel('critical')).toBe('interrupt');
    expect(escalationChannel('high')).toBe('batch');
  });

  it('waits for self-heal before it can escalate a stuck payment', () => {
    // reconcile-payments runs every 15 min. The window must be LONGER, so an
    // alert means "reconcile already tried and failed", not "first attempt".
    expect(SELF_HEAL_WINDOW_MIN).toBeGreaterThan(15);
  });

  it('has a real buddy SLA', () => {
    expect(BUDDY_SLA_HOURS).toBeGreaterThanOrEqual(1);
  });
});

describe('the detector only fires after self-heal has failed', () => {
  const src = readFileSync('src/lib/os/sacred-guard.ts', 'utf8');

  it('filters stuck payments by the self-heal deadline', () => {
    // The query must exclude anything younger than the window — otherwise it
    // pages the founder about a payment reconcile is about to fix.
    expect(src).toContain('healDeadline');
    expect(src).toContain("lt('paid_at', healDeadline)");
  });

  it('skips a payment whose student WAS SERVED', () => {
    // Was `prof.is_premium === true) continue` until 5 Sep 2026. That asked
    // whether the student is premium RIGHT NOW, which also goes false when a
    // subscription simply expires — so three correctly-served month-old
    // payments sat as permanent CRITICAL alerts that no action could clear.
    // The healthy case is "they received what they paid for": premium was
    // granted at least once (premium_since, which only activation writes), or
    // for a single-session purchase, the credit exists.
    expect(src).toContain('if (delivered) continue');
    expect(src).toMatch(/prof\.premium_since !== null/);
    expect(src).toMatch(/creditedPayIds\.has\(pay\.id\)/);
  });

  it('carries the student, the money, the cause and a one-click action', () => {
    // The founder never gets "payment failed" — always who, why, and a button.
    for (const field of ['student:', 'amountRupees', 'rootCause', 'actionLabel', 'actionRoute', 'retryAvailable']) {
      expect(src, `alert is missing ${field}`).toContain(field);
    }
  });
});

describe('the escalation cron does not become a pager storm', () => {
  const cron = readFileSync('src/app/api/cron/founder-alerts/route.ts', 'utf8');

  it('escalates only NEW critical failures', () => {
    // A persistent failure is paged once, not every 15 minutes.
    expect(cron).toContain('founder_alert_sent');
    expect(cron).toContain('fresh');
    expect(cron).toMatch(/newlyEscalated/);
  });

  it('only critical severity interrupts by email', () => {
    expect(cron).toContain("a.severity === 'critical'");
  });

  it('is honest about the channel it has', () => {
    // Email is the real interrupt channel today; the cron must not claim a
    // WhatsApp send it cannot make.
    expect(cron).toContain('sendAdminAlert');
  });
});

// ── AN EMPTY RECORD IS NOT AN EMPTY SERVICE (15 Sep 2026) ───────────────────
//
// This alert shipped reading an empty delivery record as "this student
// received nothing", firing CRITICAL and naming a mentor's student to the
// founder. The founder confirmed the sessions WERE delivered, on time — they
// were never closed out in the app.
//
// `release-stale-sessions` already said so: `expired` means "the window
// passed, nobody recorded an outcome", and that file explicitly refuses to
// write `cancelled` because that "asserts it did NOT happen". Reading expired
// as undelivered made exactly the inference it exists to refuse — on 11 of the
// first 18 sessions ever created.
//
// The alert now reports the only thing we know: for a paying student, we
// cannot say what they received.
describe('an unrecorded session is not an undelivered one', () => {
  const full = readFileSync('src/lib/os/sacred-guard.ts', 'utf8');
  // Scoped to block 2b. Alert 2 ("paying student with NO mentor") may keep its
  // own stronger words — a student with no mentor at all genuinely has nothing,
  // and that is a claim we CAN see.
  const src = full.slice(full.indexOf('── 2b.'), full.indexOf('── 3.'));

  it('looks at students who DO have a mentor, not only those who do not', () => {
    // Alert 2 is `.is('buddy_id', null)`. This one is its mirror — without it,
    // having a mentor assigned is enough to be counted as served forever.
    expect(src).toContain("not('buddy_id', 'is', null)");
  });

  it('never claims the student received nothing', () => {
    // The words that made the first version an accusation. A mentor who did
    // the work must never read any of these about herself.
    for (const banned of [
      'has never had a session',
      'The one thing they paid for, undelivered',
      'are not delivery',
    ]) {
      expect(src, `"${banned}" asserts something we cannot see`).not.toContain(banned);
    }
  });

  it('says plainly that expiry is a missing record, not a failed call', () => {
    expect(src).toContain('nobody recorded an outcome — not that the call failed');
  });

  it('is high, not critical — we do not know a student is in a broken state', () => {
    // Critical interrupts. Spending that on a record-keeping gap is how the
    // alarm that money exceptions need stops being believed.
    expect(src).toMatch(/mentorship-unrecorded[\s\S]{0,600}severity: 'high'/);
  });

  it('separates "nothing was booked" from "nothing was closed out"', () => {
    // The founder's next action differs: one is a mentor who never got a
    // calendar, the other is four calls nobody pressed the button on.
    expect(src).toContain('unclosedBy');
    expect(src).toMatch(/with no session ever booked/);
    expect(src).toMatch(/without being closed out/);
  });

  it('still counts only a session that ENDED as recorded delivery', () => {
    // Booked and scheduled are things WE did; ended_at is the positive fact.
    expect(src).toContain("not('ended_at', 'is', null)");
  });

  it('treats an unknown premium_since as overdue, never as fresh', () => {
    expect(src).toMatch(/since != null && since >= undeliveredDeadline/);
  });
});
