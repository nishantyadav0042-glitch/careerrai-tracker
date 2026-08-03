import { describe, it, expect } from 'vitest';
import { paceHeadline, type PaceHeadlineInput } from './pace-headline';

const base: PaceHeadlineInput = {
  status: 'on_pace',
  requiredPerDay: 3,
  aheadPerDay: 0,
  catchUpPerDay: 0,
  committedPerDay: 3,
  plannedMinutes: 180,
  weekHours: [3, 3, 3, 3, 3, 3, 3],
};
const on = (o: Partial<PaceHeadlineInput>): PaceHeadlineInput => ({ ...base, ...o });

describe('the contradiction this file exists to prevent', () => {
  it('reproduces the exact screenshot: 9h needed above a 30-minute plan', () => {
    // Student's report, with his own numbers: "9h needed · 1h ahead" over a
    // plan of 12m + 9m + 9m. He asked why. The card must answer, not assert.
    const h = paceHeadline(on({
      status: 'ahead', requiredPerDay: 9, aheadPerDay: 1,
      plannedMinutes: 30, weekHours: [0, 0, 0, 0, 0, 0, 0],
    }));
    expect(h.capped).toBe(true);
    expect(h.text).toBe("9h needed · today's plan is 30m");
    expect(h.sub).toContain('0h in the last 7 days');
    // The old headline claimed he was AHEAD. That must be gone.
    expect(h.text).not.toContain('ahead');
  });

  it('explains the cap in the student’s terms, never the system’s', () => {
    const h = paceHeadline(on({ requiredPerDay: 9, plannedMinutes: 30, weekHours: [0, 0, 0, 0, 0, 0, 0] }));
    expect(h.sub).toContain('30 minutes');
    // "capacity engine", "sustainable hours" etc. mean nothing to a student.
    expect(h.sub?.toLowerCase()).not.toContain('capacity');
    expect(h.sub?.toLowerCase()).not.toContain('engine');
  });

  it('names their real average when they HAVE studied, just less than needed', () => {
    const h = paceHeadline(on({ requiredPerDay: 9, plannedMinutes: 120, weekHours: [2, 0, 2, 0, 2, 0, 0] }));
    expect(h.capped).toBe(true);
    expect(h.sub).toContain('2h');
  });
});

describe('when NOT to cry wolf', () => {
  it('stays quiet when the plan is merely rounded down, not capped', () => {
    // 2.5h of plan against 3h of need is rounding, not a contradiction.
    // Flagging that would make the warning meaningless inside a week.
    const h = paceHeadline(on({ requiredPerDay: 3, plannedMinutes: 150 }));
    expect(h.capped).toBe(false);
    expect(h.sub).toBeNull();
  });

  it('is silent at exactly half — the boundary is not a contradiction', () => {
    const h = paceHeadline(on({ requiredPerDay: 4, plannedMinutes: 120 }));
    expect(h.capped).toBe(false);
  });

  it('says nothing when no plan has been generated yet', () => {
    const h = paceHeadline(on({ requiredPerDay: 9, plannedMinutes: null }));
    expect(h.capped).toBe(false);
    expect(h.text).toBe('9h a day, steady');
  });

  it('leaves a completed syllabus alone', () => {
    const h = paceHeadline(on({ status: 'done', requiredPerDay: 9, plannedMinutes: 30 }));
    expect(h.text).toBe('Syllabus complete 🎉');
    expect(h.capped).toBe(false);
  });
});

describe('"ahead" has to be earned', () => {
  it('refuses to claim ahead when nothing was logged all week', () => {
    // Same broken promise in a friendlier voice. The ring may be ahead on
    // syllabus; the student is not ahead on anything they can feel.
    const h = paceHeadline(on({
      status: 'ahead', requiredPerDay: 2, aheadPerDay: 1,
      plannedMinutes: 120, weekHours: [0, 0, 0, 0, 0, 0, 0],
    }));
    expect(h.text).toBe('2h a day needed');
    expect(h.text).not.toContain('ahead');
    expect(h.sub).toContain('Nothing logged');
  });

  it('does claim ahead when the week backs it up', () => {
    const h = paceHeadline(on({
      status: 'ahead', requiredPerDay: 2, aheadPerDay: 1,
      plannedMinutes: 120, weekHours: [3, 3, 0, 3, 3, 0, 3],
    }));
    expect(h.text).toBe('2h needed · 1h ahead');
    expect(h.capped).toBe(false);
  });
});

describe('the other headlines still work', () => {
  it('keeps the catch-up form', () => {
    const h = paceHeadline(on({ catchUpPerDay: 2, committedPerDay: 3, plannedMinutes: 180 }));
    expect(h.text).toBe('3h + 2h catch-up');
  });

  it('a capped plan outranks catch-up — the smaller truth wins', () => {
    // If we are only planning 20 minutes, promising "3h + 2h catch-up" is the
    // contradiction all over again.
    const h = paceHeadline(on({ requiredPerDay: 3, catchUpPerDay: 2, plannedMinutes: 20 }));
    expect(h.capped).toBe(true);
    expect(h.text).toContain('20m');
  });

  it('falls back to the steady line', () => {
    expect(paceHeadline(base).text).toBe('3h a day, steady');
  });
});
