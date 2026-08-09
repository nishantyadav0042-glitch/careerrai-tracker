import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STUDENT_BUDGET_TYPES } from './notification-os';

// The 8 AM "you forgot yesterday" nudge. Founder's rules, locked in source:
// only students who OPENED yesterday, SKIP anyone who already logged, and the
// link must open yesterday's log so the streak stays alive.
const route = readFileSync('src/app/api/cron/log-yesterday-reminder/route.ts', 'utf8');

describe('the 8 AM log-yesterday reminder is surgical and positive', () => {
  it('only nudges students who opened the app yesterday', () => {
    expect(route).toContain("event', 'app_open'");
    expect(route).toContain('openedYesterday.has(s.id)');
  });

  it('skips anyone who already logged yesterday', () => {
    expect(route).toContain('loggedYesterday.has(s.id)');
    expect(route).toContain('skippedAlreadyLogged');
  });

  it('deep-links into YESTERDAY’s log so the streak is kept alive', () => {
    expect(route).toContain('/student/tracker?log=yesterday');
  });

  it('rides the budgeted dispatch path, and its type counts against the cap', () => {
    expect(route).toContain('dispatch(');
    expect(route).toContain("type: 'log_recovery'");
    expect(STUDENT_BUDGET_TYPES).toContain('log_recovery');
  });

  it('reaches only students who can actually receive the 8 AM push', () => {
    expect(route).toContain("not('push_subscription', 'is', null)");
    // demo accounts (shared logins) excluded.
    expect(route).toContain("not('is_demo', 'is', true)");
  });

  it('the tracker honours the yesterday deep-link', () => {
    const app = readFileSync('src/components/DailyTracker/DailyTrackerApp.tsx', 'utf8');
    expect(app).toContain("params.get('log') !== 'yesterday'");
    expect(app).toContain('setLogDateOverride(yesterdayStr)');
  });
});
