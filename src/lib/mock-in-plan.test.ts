import { describe, it, expect } from 'vitest';
import { isMockSitting, findTodaysMock } from './mock-in-plan';

// The whole point of this module is telling apart two things that both have
// the word "mock" in them: sitting a fresh paper (a score exists tonight that
// does not exist now) and studying one already sat (it does not). Get it
// wrong in the generous direction and we ask a repeater to re-enter last
// week's percentiles; get it wrong in the strict direction and the student
// who just sat three hours has nowhere to put the result.

const task = (id: string, label: string) => ({ id, label });

describe('the days that produce a score', () => {
  it('the calendar full mock', () => {
    expect(isMockSitting(task('exam-mock', 'Full mock'))).toBe(true);
  });

  it('the working professional\'s weekday sectional', () => {
    expect(isMockSitting(task('weekday-sectional', 'QA — timed sectional'))).toBe(true);
  });

  it('the intensive-phase sectional mock', () => {
    expect(isMockSitting(task('mock-or-review', 'Sectional mock'))).toBe(true);
  });
});

describe('the days that do not', () => {
  it('analysing yesterday\'s paper', () => {
    expect(isMockSitting(task('exam-mock-analysis', "Analyse yesterday's mock"))).toBe(false);
  });

  it('a repeater re-opening their last mock — SAME id as the sectional', () => {
    // routine-engine gives both variants the id `mock-or-review`, so id alone
    // cannot decide this one. If this ever passes, repeaters get a score box
    // every single day for a paper they sat weeks ago.
    expect(isMockSitting(task('mock-or-review', 'Mock analysis'))).toBe(false);
  });

  it('ordinary topic work', () => {
    expect(isMockSitting(task('qa-1', 'Geometry — 15 questions'))).toBe(false);
    expect(isMockSitting(task('varc-1', 'Reading Comprehension — 2 passages'))).toBe(false);
  });

  it('revision, which reviews without producing anything new', () => {
    expect(isMockSitting(task('revision-block', 'QA rapid recall'))).toBe(false);
  });
});

describe('routines generated before this shipped', () => {
  it('falls back to the label when the id is unrecognised', () => {
    // Stored routine rows are frozen — old ones will never grow a new field,
    // so detection has to work from what is already on them.
    expect(isMockSitting(task('legacy-42', 'Sectional mock'))).toBe(true);
    expect(isMockSitting(task('legacy-42', 'Mock review'))).toBe(false);
  });

  it('survives a missing label without throwing', () => {
    expect(isMockSitting({ id: 'legacy-42' } as { id: string; label: string })).toBe(false);
  });
});

describe('findTodaysMock', () => {
  it('returns the first sit-a-paper task in the day', () => {
    const tasks = [
      task('exam-mock-analysis', "Analyse yesterday's mock"),
      task('exam-mock', 'Full mock'),
      task('qa-1', 'Geometry'),
    ];
    expect(findTodaysMock(tasks)?.id).toBe('exam-mock');
  });

  it('returns null on a normal study day', () => {
    expect(findTodaysMock([task('qa-1', 'Geometry'), task('varc-1', 'RC')])).toBeNull();
  });
});
