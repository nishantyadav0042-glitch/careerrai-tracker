import { describe, it, expect } from 'vitest';
import {
  consecutiveMissedDays,
  checkInEligibility,
  buildCheckInDraft,
  checkInBecause,
  type CheckInFacts,
} from './buddy-checkin';
import {
  CHECKIN_MISSED_DAYS_TRIGGER,
  CHECKIN_MAX_MISSED_DAYS,
  CHECKIN_COOLDOWN_DAYS,
  CHECKIN_MAX_UNANSWERED,
} from './scale-config';

const TODAY = '2026-08-10';

const facts = (over: Partial<CheckInFacts> = {}): CheckInFacts => ({
  firstName: 'Rahul',
  missedDays: 2,
  streakAtBreak: 0,
  lastLogHadMock: false,
  lastMockName: null,
  lastBlocker: null,
  coldSection: null,
  ...over,
});

describe('consecutiveMissedDays', () => {
  it('counts back from yesterday, not today', () => {
    // Nothing logged at all; today is still open, so today is never "missed".
    expect(consecutiveMissedDays([], TODAY)).toBe(30); // hits the 30-day stop
    // Logged yesterday → zero missed, even with nothing today.
    expect(consecutiveMissedDays(['2026-08-09'], TODAY)).toBe(0);
  });

  it('counts a two-day gap', () => {
    expect(consecutiveMissedDays(['2026-08-07', '2026-08-06'], TODAY)).toBe(2);
  });

  it('treats a rest-day log as showing up', () => {
    // The log row exists (day_outcome = rest). The founder removed
    // "studied / not studied" precisely so this counts as participation — a
    // student who logs a rest day must NEVER get a "where are you" message.
    const withRestDay = consecutiveMissedDays(['2026-08-09'], TODAY);
    expect(withRestDay).toBe(0);
    expect(checkInEligibility({
      missedDays: withRestDay,
      lastCheckInSentAt: null,
      unansweredCheckIns: 0,
      hasOpenDraft: false,
      now: new Date(`${TODAY}T09:30:00Z`),
    }).eligible).toBe(false);
  });

  it('a log today does not rescue a two-day gap before it', () => {
    // Counting starts at yesterday, so today's log is irrelevant to the miss
    // that already happened.
    expect(consecutiveMissedDays([TODAY, '2026-08-06'], TODAY)).toBe(3);
  });
});

describe('checkInEligibility', () => {
  const base = {
    missedDays: CHECKIN_MISSED_DAYS_TRIGGER,
    lastCheckInSentAt: null,
    unansweredCheckIns: 0,
    hasOpenDraft: false,
    now: new Date('2026-08-10T09:30:00Z'),
  };

  it('drafts at the trigger, never below it', () => {
    expect(checkInEligibility(base).eligible).toBe(true);
    expect(checkInEligibility({ ...base, missedDays: CHECKIN_MISSED_DAYS_TRIGGER - 1 }))
      .toEqual({ eligible: false, reason: 'still_logging' });
  });

  it('stops once the student is long gone, not quiet', () => {
    // Live data, 10 Aug: two assigned accounts were 13 and 31 days silent. The
    // 13-day one is still a check-in; the 31-day one is churn and must not
    // produce a "sab theek hai?" for a mentor to send a month late.
    expect(checkInEligibility({ ...base, missedDays: CHECKIN_MAX_MISSED_DAYS }).eligible).toBe(true);
    expect(checkInEligibility({ ...base, missedDays: CHECKIN_MAX_MISSED_DAYS + 1 }))
      .toEqual({ eligible: false, reason: 'long_gone' });
    expect(checkInEligibility({ ...base, missedDays: 31 }))
      .toEqual({ eligible: false, reason: 'long_gone' });
  });

  it('never stacks a second draft on the mentor', () => {
    expect(checkInEligibility({ ...base, hasOpenDraft: true }))
      .toEqual({ eligible: false, reason: 'draft_pending' });
  });

  it('stops after the unanswered limit — and says so honestly', () => {
    // Reported as unanswered_stop rather than cooldown even when both apply,
    // because that is what tells the mentor to stop typing and call.
    expect(checkInEligibility({
      ...base,
      unansweredCheckIns: CHECKIN_MAX_UNANSWERED,
      lastCheckInSentAt: '2026-08-09T09:30:00Z',
    })).toEqual({ eligible: false, reason: 'unanswered_stop' });
  });

  it('holds the cooldown, then releases it', () => {
    const inside = new Date(base.now.getTime() - (CHECKIN_COOLDOWN_DAYS - 1) * 86_400_000);
    const outside = new Date(base.now.getTime() - (CHECKIN_COOLDOWN_DAYS + 1) * 86_400_000);
    expect(checkInEligibility({ ...base, lastCheckInSentAt: inside.toISOString() }))
      .toEqual({ eligible: false, reason: 'cooldown' });
    expect(checkInEligibility({ ...base, lastCheckInSentAt: outside.toISOString() }).eligible).toBe(true);
  });
});

describe('buildCheckInDraft', () => {
  it('leads with the broken streak when there was one worth mourning', () => {
    const d = buildCheckInDraft(facts({ streakAtBreak: 14 }));
    expect(d.signal).toBe('streak_broken');
    expect(d.body).toContain('14 din');
    expect(d.body).toContain('Rahul');
  });

  it('ignores a streak too short to mean anything', () => {
    expect(buildCheckInDraft(facts({ streakAtBreak: 2 })).signal).toBe('silent');
  });

  it('names the mock when they went quiet right after one', () => {
    const d = buildCheckInDraft(facts({ lastLogHadMock: true, lastMockName: 'SIMCAT 4' }));
    expect(d.signal).toBe('after_mock');
    expect(d.body).toContain('SIMCAT 4');
  });

  it('quotes the blocker the student typed', () => {
    const d = buildCheckInDraft(facts({ lastBlocker: 'college exams chal rahe hain' }));
    expect(d.signal).toBe('blocker');
    expect(d.body).toContain('college exams chal rahe hain');
  });

  it('flattens and truncates student text before quoting it back', () => {
    const nasty = `line one\n\n   line   two ${'x'.repeat(200)}`;
    const d = buildCheckInDraft(facts({ lastBlocker: nasty }));
    expect(d.body).not.toContain('\n');
    expect(d.body).toContain('line one line two');
    expect(d.body.length).toBeLessThan(400);
  });

  it('only mentions a cold section once it is actually cold', () => {
    expect(buildCheckInDraft(facts({ coldSection: { section: 'DILR', days: 2 } })).signal).toBe('silent');
    const d = buildCheckInDraft(facts({ coldSection: { section: 'DILR', days: 9 } }));
    expect(d.signal).toBe('section_cold');
    expect(d.body).toContain('DILR');
  });

  it('always falls through to a plain, warm line', () => {
    const d = buildCheckInDraft(facts());
    expect(d.signal).toBe('silent');
    expect(d.body).toContain('Rahul');
  });

  // Founder, 10 Aug: "keep the language good, not rude." A mentor's check-in
  // that makes a student feel caught makes them avoid the app, which is the
  // exact opposite of the point. No draft may accuse.
  it('never accuses, and always offers something', () => {
    const all = [
      buildCheckInDraft(facts({ streakAtBreak: 14 })),
      buildCheckInDraft(facts({ lastLogHadMock: true, lastMockName: 'SIMCAT 4' })),
      buildCheckInDraft(facts({ lastBlocker: 'travel' })),
      buildCheckInDraft(facts({ coldSection: { section: 'DILR', days: 9 } })),
      buildCheckInDraft(facts()),
    ];
    for (const d of all) {
      expect(d.body).not.toMatch(/kyun nahi|why did.?n.?t|atka hai kya|lazy|serious ho/i);
      expect(d.body).toMatch(/batao|bata do|bolo|reply|dekh lete hain|dete hain/i);
    }
  });

  it('degrades to a usable line when the name is missing', () => {
    const d = buildCheckInDraft(facts({ firstName: '' }));
    expect(d.body.startsWith('Hi,')).toBe(true);
  });

  it('every draft carries the evidence it was built from', () => {
    const d = buildCheckInDraft(facts({ streakAtBreak: 9 }));
    expect(d.evidence).toMatchObject({ streakAtBreak: 9, missedDays: 2 });
    expect(checkInBecause(d.signal, d.evidence)).toContain('9-day streak');
  });
});

describe('checkInBecause', () => {
  it('explains every signal to the mentor before they send it', () => {
    const signals = ['streak_broken', 'after_mock', 'blocker', 'section_cold', 'silent'] as const;
    for (const s of signals) {
      const line = checkInBecause(s, {
        streakAtBreak: 7, lastMockName: 'SIMCAT 2', lastBlocker: 'fever', section: 'QA', coldDays: 6,
      });
      expect(line.length).toBeGreaterThan(10);
      expect(line).not.toContain('undefined');
    }
  });
});
