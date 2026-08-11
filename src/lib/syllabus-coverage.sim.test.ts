import { describe, it, expect } from 'vitest';
import { chooseTopicForSection, type TopicCandidateInput } from './topic-selector';
import { syllabusPace } from './syllabus-pace';
import { TOPICS_BY_SECTION } from './coverage-validate';

// Simulate Abhishek's remaining 25 days with the real engine and print the
// answer to the founder's question: does he finish the syllabus?
const DAYS = 25;

function simulate(pressureOn: boolean) {
  const opened = new Set<string>();
  const served: Record<string, number> = {};
  const state: Record<string, TopicCandidateInput[]> = {};

  for (const section of ['VARC', 'DILR', 'QA'] as const) {
    state[section] = (TOPICS_BY_SECTION[section] as string[]).map((topic) => ({
      topic,
      coverageStatus: 'not_started' as const,
      daysSinceLastPracticed: null,
      daysSincePlanned: null,
    }));
  }
  // Seed the five QA topics he had already been served, as of 11 Aug.
  const seeded: Record<string, 'revising' | 'practicing'> = {
    Percentages: 'revising', 'Ratio & Proportion': 'revising',
    'Quadratic Equations': 'revising', Average: 'revising', Functions: 'practicing',
  };
  for (const c of state.QA) if (seeded[c.topic]) {
    c.coverageStatus = seeded[c.topic];
    c.daysSinceLastPracticed = 3;
    c.daysSincePlanned = 3;
    opened.add(c.topic);
  }

  for (let day = 0; day < DAYS; day++) {
    for (const section of ['VARC', 'DILR', 'QA'] as const) {
      const pool = state[section];
      const untouched = pool.filter((c) => c.coverageStatus === 'not_started').length;
      const pace = pressureOn
        ? syllabusPace({ untouchedTopics: untouched, daysToTarget: DAYS - day })
        : { pressure: 0 };
      const choice = chooseTopicForSection(pool, 1, false, pace.pressure);
      opened.add(choice.topic);
      served[choice.topic] = (served[choice.topic] ?? 0) + 1;
      for (const c of pool) {
        if (c.topic === choice.topic) {
          c.daysSincePlanned = 0;
          c.daysSinceLastPracticed = 0;
          if (c.coverageStatus === 'not_started') c.coverageStatus = 'learning';
        } else {
          if (c.daysSincePlanned != null) c.daysSincePlanned += 1;
          if (c.daysSinceLastPracticed != null) c.daysSinceLastPracticed += 1;
        }
      }
    }
  }
  const total = (['VARC', 'DILR', 'QA'] as const).reduce((n, s) => n + TOPICS_BY_SECTION[s].length, 0);
  const worst = Object.entries(served).sort((a, b) => b[1] - a[1])[0];
  const perSection = (['VARC', 'DILR', 'QA'] as const).map((s) => {
    const done = state[s].filter((c) => c.coverageStatus !== 'not_started').length;
    return `${s} ${done}/${TOPICS_BY_SECTION[s].length}`;
  }).join('  ');
  const qaWorst = Object.entries(served)
    .filter(([t]) => (TOPICS_BY_SECTION.QA as string[]).includes(t))
    .sort((a, b) => b[1] - a[1])[0];
  return { distinct: opened.size, total, worst, qaWorst, perSection, served };
}

// Simulating Abhishek's real remaining 25 days through the real engine, the
// numbers measured on 11 Aug 2026 were:
//
//   BEFORE (what he was living):  16/46 topics  [VARC 4/9  DILR 4/9  QA 8/28]
//                                 worst repeat: Profit & Loss 7x
//   AFTER  (paced):               35/46 topics  [VARC 7/9  DILR 9/9  QA 19/28]
//                                 worst repeat: Profit & Loss 4x
//
// The honest part: 35/46 is not 46/46. At one QA topic a day he CANNOT open
// all 28 QA topics in 25 days while still revising anything — that is
// arithmetic, not a bug, and the answer is to tell him and move the date or
// the hours (syllabusPace.behind + .summary exist for exactly that), never to
// quietly pretend the plan fits.
describe('Abhishek — 25 days from 11 Aug, real engine', () => {
  it('opens more than twice the topics it used to', () => {
    const before = simulate(false);
    const after = simulate(true);
    expect(before.distinct).toBeLessThanOrEqual(20);          // the trap
    expect(after.distinct).toBeGreaterThanOrEqual(before.distinct * 2);
  });

  it('stops any single topic dominating the month', () => {
    const after = simulate(true);
    const before = simulate(false);
    expect(after.qaWorst![1]).toBeLessThan(before.qaWorst![1]);
    expect(after.qaWorst![1]).toBeLessThanOrEqual(5);
  });

  it('never leaves a whole section barely touched', () => {
    // DILR went 4/9 → 9/9. A section the engine had effectively abandoned.
    const after = simulate(true);
    expect(after.perSection).toContain('DILR 9/9');
  });
});
