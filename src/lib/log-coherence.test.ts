import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The Abhishek incident (9 Aug): hours were a self-reported field in the log
// sheet, but the weekly finish-date engine (plan-extension.ts) prices the whole
// week on them. A student who marked "studied", picked his topics, and left the
// optional hours at 0 recorded a studied day worth 0h — and had his finish date
// pushed a week while showing up daily on a 12-day streak. 229 students were
// moved in the first reconcile run.
//
// Founder's fix: remove the hours field entirely and DERIVE hours from coverage
// — "we already gave them a study plan; if they covered the topic, our goal is
// covered." These guards keep that model in source.

describe('hours are derived from coverage, never self-reported', () => {
  it('the log sheet no longer asks for hours and derives them on submit', () => {
    const modal = readFileSync('src/components/DailyTracker/LoggingModal.tsx', 'utf8');
    // The manual hours picker is gone.
    expect(modal).not.toContain('HOURS_OPTIONS');
    // Hours are computed from coverage at submit time.
    expect(modal).toContain('creditedHours');
    expect(modal).toContain('derivedHours');
  });

  it('the derivation is generous to off-plan coverage but capped at the plan', () => {
    // The pure rule lives in study-credit.ts and is unit-tested there; assert the
    // shape the modal depends on so a rename here fails loudly.
    const credit = readFileSync('src/lib/study-credit.ts', 'utf8');
    expect(credit).toContain('offPlanCount');
    expect(credit).toContain('Math.min(1');
  });

  it('the log API accepts a derived fractional hours value, not just 0-10 integers', () => {
    const route = readFileSync('src/app/api/logging/log-daily/route.ts', 'utf8');
    expect(route).toContain('Number.isFinite(body.hours)');
    // The old integer-only cap that would reject a derived 5.5 or 11 is gone.
    expect(route).not.toContain('Invalid hours (0-10)');
  });
});
