import { describe, it, expect } from 'vitest';
import { cohortOf, whatsappDraft, type LogBreakerRow } from './log-breakers';

const base: LogBreakerRow = {
  studentId: 's1', name: 'Rahul Sharma', phone: '+911234567890',
  signupDate: '2026-08-01', installed: true,
  logDays: 1, firstLog: '2026-08-20', lastLog: '2026-08-20', daysSinceLastLog: 6,
  longestStreak: 1, liveStreak: 0, streakBroken: false,
  returnedNextDay: false, returnedWithin3: false, returnedWithin7: false,
  lastContactAt: null, lastContactNote: null,
};

describe('cohorts answer the founder’s filters', () => {
  it('one log, days ago → 1-day AND never-returned', () => {
    expect(cohortOf(base, '2026-08-26')).toEqual(['1', 'never_returned']);
  });

  it('one log YESTERDAY is not accused of never returning', () => {
    // "Never returned" needs the alibi checked — they haven't had a day 2 yet.
    expect(cohortOf({ ...base, firstLog: '2026-08-25', lastLog: '2026-08-25' }, '2026-08-26'))
      .toEqual(['1']);
  });

  it('a dead 5-day chain → 5-days AND broken', () => {
    expect(cohortOf({ ...base, logDays: 5, longestStreak: 5, liveStreak: 0 }, '2026-08-26'))
      .toEqual(['5', 'broken']);
  });

  it('a LIVE streak is never "broken" — do not message someone mid-streak', () => {
    expect(cohortOf({ ...base, logDays: 5, longestStreak: 5, liveStreak: 5 }, '2026-08-26'))
      .toEqual(['5']);
  });

  it('7 or more collapses into 7plus', () => {
    expect(cohortOf({ ...base, logDays: 12, longestStreak: 8, liveStreak: 0 }, '2026-08-26'))
      .toEqual(['7plus', 'broken']);
  });
});

describe('the WhatsApp drafts obey the founder’s rules', () => {
  const cohorts = [1, 2, 5, 9].map((d) => whatsappDraft({ ...base, logDays: d, longestStreak: Math.max(1, d) }));

  it('every draft is first-person, named, and asks ONE question', () => {
    for (const d of cohorts) {
      expect(d).toContain('Rahul');
      expect(d).toContain('Nishant');
      expect(d).toMatch(/\?/);
    }
  });

  it('no selling, no price, no guilt, no analytics-speak', () => {
    for (const d of cohorts) {
      expect(d).not.toMatch(/₹|buy|offer|discount|premium|upgrade/i);
      expect(d).not.toMatch(/dashboard|data shows|analytics|metric/i);
      expect(d).not.toMatch(/\byou (failed|should have|must)\b/i);
    }
  });

  it('the message escalates with investment: a 9-day breaker hears their streak named', () => {
    expect(whatsappDraft({ ...base, logDays: 9, longestStreak: 9, lastLog: '2026-08-20' }))
      .toContain('9 days');
  });
});
