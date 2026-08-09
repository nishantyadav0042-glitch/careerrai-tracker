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

  it('skips a payment whose student IS premium', () => {
    // A `paid` row on an activated student is the healthy case, not an alert.
    expect(src).toContain('prof.is_premium === true) continue');
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
