import { describe, it, expect } from 'vitest';
import {
  assessFinishDate, feasibilityMessage, FIRST_CONTACT_SHARE, TIGHT_MARGIN,
} from './date-feasibility';
import { TOPICS_BY_SECTION } from './day-topics';
import { topicHours } from './prep-model';

// ── Telling a student their date does not work ──────────────────────────────
//
// Founder, 14 Aug, option (a): "...and if the date is too close, tell them the
// date doesn't work."
//
// The easy failure here is silence — quietly dropping topics fits any date and
// nobody notices until CAT. These tests pin the uncomfortable behaviour: name
// the gap, in hours, against a date the student chose.

const ALL = (['VARC', 'DILR', 'QA'] as const).flatMap((s) => TOPICS_BY_SECTION[s]);
const FULL_SYLLABUS_HOURS = Math.round(ALL.reduce((s, t) => s + (topicHours(t) ?? 0), 0));

describe('the arithmetic is checkable', () => {
  it('needed hours is the sum of the untouched topics own estimates', () => {
    const f = assessFinishDate({ untouchedTopics: ALL, hoursPerDay: 8, daysToTarget: 90 });
    expect(f.neededHours).toBe(FULL_SYLLABUS_HOURS);
  });

  it('available hours is days x hours x the first-contact share', () => {
    const f = assessFinishDate({ untouchedTopics: ALL, hoursPerDay: 8, daysToTarget: 50 });
    expect(f.availableHours).toBe(Math.round(50 * 8 * FIRST_CONTACT_SHARE));
  });

  it('does not pretend a whole day goes to new topics', () => {
    // Revision, mocks and the closing task take their share. A verdict of
    // "fits" is already the optimistic case, which is the honest direction for
    // a warning to err in.
    expect(FIRST_CONTACT_SHARE).toBeLessThan(1);
    expect(FIRST_CONTACT_SHARE).toBeGreaterThan(0.4);
  });
});

describe('the verdicts', () => {
  it('a genuinely impossible date is called impossible', () => {
    // The whole syllabus, two hours a day, ten days.
    const f = assessFinishDate({ untouchedTopics: ALL, hoursPerDay: 2, daysToTarget: 10 });
    expect(f.verdict).toBe('impossible');
    expect(f.shortfallHours).toBeGreaterThan(0);
    expect(f.extraDaysNeeded).toBeGreaterThan(0);
  });

  it('a comfortable date is called fine, and says nothing', () => {
    const f = assessFinishDate({ untouchedTopics: ALL, hoursPerDay: 10, daysToTarget: 200 });
    expect(f.verdict).toBe('fits');
    expect(feasibilityMessage(f, '20 Feb')).toBeNull();
  });

  it('a date that only just fits is called tight, not fine', () => {
    // Sized so available lands between needed and needed x TIGHT_MARGIN.
    const needed = FULL_SYLLABUS_HOURS;
    const days = Math.ceil((needed * 1.05) / (8 * FIRST_CONTACT_SHARE));
    const f = assessFinishDate({ untouchedTopics: ALL, hoursPerDay: 8, daysToTarget: days });
    expect(f.verdict).toBe('tight');
    expect(f.availableHours).toBeGreaterThanOrEqual(f.neededHours);
    expect(f.availableHours).toBeLessThan(f.neededHours * TIGHT_MARGIN);
  });

  it('no date set is not a failure', () => {
    // The planner already treats a missing date as one new topic a day.
    // Inventing urgency here would be a claim we cannot support.
    const f = assessFinishDate({ untouchedTopics: ALL, hoursPerDay: 6, daysToTarget: null });
    expect(f.verdict).toBe('no_date');
    expect(feasibilityMessage(f, 'your date')).toBeNull();
  });

  it('a finished syllabus always fits, even on a near date', () => {
    const f = assessFinishDate({ untouchedTopics: [], hoursPerDay: 1, daysToTarget: 1 });
    expect(f.verdict).toBe('fits');
    expect(f.neededHours).toBe(0);
  });

  it('zero hours a day cannot open anything, and says so', () => {
    const f = assessFinishDate({ untouchedTopics: ALL, hoursPerDay: 0, daysToTarget: 60 });
    expect(f.verdict).toBe('impossible');
    expect(f.daysNeeded).toBeNull();
  });
});

describe('it names the promise the student is owed', () => {
  it('flags the 6h+ student, who was promised the whole syllabus', () => {
    const over = assessFinishDate({ untouchedTopics: ALL, hoursPerDay: 8, daysToTarget: 30 });
    const under = assessFinishDate({ untouchedTopics: ALL, hoursPerDay: 3, daysToTarget: 30 });
    expect(over.owedFullSyllabus).toBe(true);
    expect(under.owedFullSyllabus).toBe(false);
  });
});

describe('the sentence a student reads', () => {
  const f = assessFinishDate({ untouchedTopics: ALL, hoursPerDay: 3, daysToTarget: 20 });

  it('says the date does not work, and names the date', () => {
    const m = feasibilityMessage(f, '4 Sept')!;
    expect(m.headline).toContain('4 Sept');
    expect(m.headline).toMatch(/doesn't work/);
  });

  it('shows both numbers so the student can argue with it', () => {
    const m = feasibilityMessage(f, '4 Sept')!;
    expect(m.detail).toContain(`${f.neededHours}h`);
    expect(m.detail).toContain(`${f.availableHours}h`);
    expect(m.detail).toContain(`${f.shortfallHours}h`);
  });

  it('offers the two things the student can actually change', () => {
    // The date and the hours are both theirs. This never moves either.
    const m = feasibilityMessage(f, '4 Sept')!;
    expect(m.options).toHaveLength(2);
    expect(m.options.join(' ')).toMatch(/date/i);
    expect(m.options.join(' ')).toMatch(/hours|h to keep/i);
  });

  it('a tight date is warned about without being called broken', () => {
    const needed = FULL_SYLLABUS_HOURS;
    const days = Math.ceil((needed * 1.05) / (8 * FIRST_CONTACT_SHARE));
    const tight = assessFinishDate({ untouchedTopics: ALL, hoursPerDay: 8, daysToTarget: days });
    const m = feasibilityMessage(tight, '2 Oct')!;
    expect(m.headline).toMatch(/works, but/);
    expect(m.headline).not.toMatch(/doesn't work/);
  });
});

describe('it never moves anything', () => {
  it('is a pure reading — same input, same verdict, no side effects', () => {
    const input = { untouchedTopics: ALL, hoursPerDay: 4, daysToTarget: 40 };
    const a = assessFinishDate(input);
    const b = assessFinishDate(input);
    expect(a).toEqual(b);
    // The caller still holds the same topic list it passed in.
    expect(input.untouchedTopics).toHaveLength(ALL.length);
  });
});
