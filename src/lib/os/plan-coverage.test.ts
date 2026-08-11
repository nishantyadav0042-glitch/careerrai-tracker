import { describe, it, expect } from 'vitest';
import { assessPlanCoverage, planCoverageExceptions, MIN_DAYS_TO_JUDGE, type PlannedSlot } from './plan-coverage';

// Fixtures are the REAL numbers measured across the roster on 11 Aug 2026.
// Twenty students had 5+ days of plans; every one of them was in the loop.

function slots(pattern: [string, number][], minutes = 180): PlannedSlot[] {
  const out: PlannedSlot[] = [];
  let day = 0;
  for (const [topic, times] of pattern) {
    for (let i = 0; i < times; i++) {
      out.push({ routineDate: `2026-08-${String((day % 28) + 1).padStart(2, '0')}`, topic, minutes });
      day++;
    }
  }
  return out;
}

const base = { studentId: 's1', name: 'Test', neverOpened: 20, totalTopics: 53, daysToTarget: 25 };

describe('plan coverage — the measure nobody was taking', () => {
  it('catches Monu singh: one topic every single day for 15 days', () => {
    // Arrangements 15x out of 45 slots. He has 10 days to his date.
    const r = assessPlanCoverage({
      ...base, name: 'Monu singh', daysToTarget: 10, neverOpened: 21,
      slots: slots([['Arrangements', 15], ['Tables', 8], ['Reading Comprehension', 8],
                    ['Percentages', 5], ['Charts', 4], ['Vocabulary', 3], ['Averages', 1], ['Ratio', 1]]),
    });
    expect(r.verdict).toBe('repeating');
    expect(r.worstTopic).toBe('Arrangements');
    expect(r.worstCount).toBe(15);
    expect(r.reason).toContain('33%');
  });

  it('catches Abhay pratap: three topics in seven days', () => {
    const r = assessPlanCoverage({
      ...base, name: 'Abhay pratap', daysToTarget: 18, neverOpened: 13,
      slots: slots([['Time & Work', 7], ['Reading Comprehension', 7], ['Tables', 7]]),
    });
    expect(r.verdict).toBe('repeating');
    expect(r.distinctTopics).toBe(3);
  });

  it('reports the hours the plan actually asked for', () => {
    const r = assessPlanCoverage({ ...base, slots: slots([['A', 5], ['B', 5]], 240) });
    expect(r.plannedHours).toBe(40); // 10 slots x 240 min
  });

  it('does not accuse a student who has only just started', () => {
    const r = assessPlanCoverage({ ...base, slots: slots([['Percentages', 3]]) });
    expect(r.verdict).toBe('too_early');
    expect(r.reason).toContain('too early');
  });

  it('passes a genuinely varied plan', () => {
    const varied = Array.from({ length: 12 }, (_, i): [string, number] => [`Topic ${i}`, 1]);
    const r = assessPlanCoverage({ ...base, slots: slots(varied) });
    expect(r.verdict).toBe('healthy');
  });

  it('exceptions-first: healthy and too-early plans never render', () => {
    const rows = [
      assessPlanCoverage({ ...base, studentId: 'a', slots: slots([['X', 9]]) }),          // repeating
      assessPlanCoverage({ ...base, studentId: 'b', slots: slots([['Y', 2]]) }),          // too early
      assessPlanCoverage({ ...base, studentId: 'c', slots: slots(Array.from({ length: 12 }, (_, i): [string, number] => [`T${i}`, 1])) }),
    ];
    const shown = planCoverageExceptions(rows);
    expect(shown.map((r) => r.studentId)).toEqual(['a']);
  });

  it('needs a real run of days before it judges', () => {
    expect(MIN_DAYS_TO_JUDGE).toBeGreaterThanOrEqual(5);
  });
});
