import { describe, it, expect } from 'vitest';
import { syllabusPace, newTopicUrgencyPoints, repeatPenaltyPoints, REPEAT_COOLDOWN_DAYS } from './syllabus-pace';
import { chooseTopicForSection, type TopicCandidateInput } from './topic-selector';

// ── The Percentages loop. Abhishek, 11 Aug 2026. ────────────────────────────
//
// "Bhaiya ye baar baar same hi percentage kyu revise krwata hai… new chapter
//  to start hi nhi hote." · "Aisa na ho ki syllabus wala date tk syllabus hi
//  complete na ho, darr lagti hai 🥲"
//
// Measured from his live rows that morning: in 18 days the plan had scheduled
// 13 DISTINCT topics out of 53. Percentages 7 times, Reading Comprehension 9.
// 23 QA topics never scheduled once. Syllabus date 5 Sep — 25 days away.
//
// The fixture below is his real QA coverage, verbatim, so this test fails if
// the loop ever comes back.

describe('syllabusPace — does this plan finish?', () => {
  it('is silent when the student is ahead', () => {
    const p = syllabusPace({ untouchedTopics: 4, daysToTarget: 60 });
    expect(p.pressure).toBe(0);
    expect(p.behind).toBe(false);
    expect(newTopicUrgencyPoints(p.pressure)).toBe(0);
  });

  it('reads Abhishek’s actual numbers honestly', () => {
    // 23 QA topics unopened, 25 days to his chosen date = 0.92 new topics a
    // day. That is achievable at one a day, so `behind` is FALSE — the date is
    // still makeable. But it uses nearly the whole daily allowance, so the
    // pressure is high. Saying "behind" here would be a lie that panics him.
    const p = syllabusPace({ untouchedTopics: 23, daysToTarget: 25 });
    expect(p.behind).toBe(false);
    expect(p.pressure).toBeGreaterThan(0.8);
    expect(p.summary).toContain('23 topics unopened');
    // One more topic than days, and it genuinely is not makeable.
    expect(syllabusPace({ untouchedTopics: 30, daysToTarget: 25 }).behind).toBe(true);
  });

  it('ramps rather than cliff-edges', () => {
    const easy = syllabusPace({ untouchedTopics: 10, daysToTarget: 40 }); // 0.25/day
    const mid = syllabusPace({ untouchedTopics: 15, daysToTarget: 20 });  // 0.75/day
    const hard = syllabusPace({ untouchedTopics: 20, daysToTarget: 20 }); // 1.0/day
    expect(easy.pressure).toBe(0);
    expect(mid.pressure).toBeGreaterThan(0);
    expect(mid.pressure).toBeLessThan(1);
    expect(hard.pressure).toBe(1);
  });

  it('treats a passed date as maximum urgency, not a crash', () => {
    const p = syllabusPace({ untouchedTopics: 5, daysToTarget: 0 });
    expect(p.pressure).toBe(1);
    expect(p.behind).toBe(true);
    expect(() => syllabusPace({ untouchedTopics: 5, daysToTarget: -9 })).not.toThrow();
  });

  it('goes quiet once everything has been started', () => {
    expect(syllabusPace({ untouchedTopics: 0, daysToTarget: 3 }).pressure).toBe(0);
  });
});

describe('repeat cool-down', () => {
  it('punishes a topic the plan just showed, hardest on the same day', () => {
    expect(repeatPenaltyPoints(0)).toBeLessThan(repeatPenaltyPoints(2));
    expect(repeatPenaltyPoints(0)).toBeLessThanOrEqual(-40);
  });

  it('is a cool-down, not a ban', () => {
    expect(repeatPenaltyPoints(REPEAT_COOLDOWN_DAYS)).toBe(0);
    expect(repeatPenaltyPoints(30)).toBe(0);
    expect(repeatPenaltyPoints(null)).toBe(0); // never planned
  });
});

// Abhishek's real QA coverage, 11 Aug 2026 (student 352d0c81…).
const ABHISHEK_QA: TopicCandidateInput[] = [
  { topic: 'Ratio & Proportion', coverageStatus: 'revising', daysSinceLastPracticed: 1, daysSincePlanned: 1 },
  { topic: 'Quadratic Equations', coverageStatus: 'revising', daysSinceLastPracticed: 2, daysSincePlanned: 2 },
  { topic: 'Percentages', coverageStatus: 'revising', daysSinceLastPracticed: 3, daysSincePlanned: 0 },
  { topic: 'Average', coverageStatus: 'revising', daysSinceLastPracticed: 4, daysSincePlanned: 4 },
  { topic: 'Functions', coverageStatus: 'practicing', daysSinceLastPracticed: 7, daysSincePlanned: 7 },
  { topic: 'Profit & Loss', coverageStatus: 'practicing', daysSinceLastPracticed: 17, daysSincePlanned: null },
  { topic: 'Time & Work', coverageStatus: 'practicing', daysSinceLastPracticed: 17, daysSincePlanned: null },
  { topic: 'Time Speed Distance', coverageStatus: 'practicing', daysSinceLastPracticed: 17, daysSincePlanned: null },
  { topic: 'SI & CI', coverageStatus: 'practicing', daysSinceLastPracticed: 17, daysSincePlanned: null },
  { topic: 'Linear Equations', coverageStatus: 'practicing', daysSinceLastPracticed: 17, daysSincePlanned: null },
  { topic: 'Inequalities', coverageStatus: 'learning', daysSinceLastPracticed: null, daysSincePlanned: null },
  { topic: 'Progressions', coverageStatus: 'learning', daysSinceLastPracticed: null, daysSincePlanned: null },
  // The 17 he had never once been shown.
  ...['Mixtures', 'Triangles', 'Circles', 'Mensuration', 'Probability', 'Permutation & Combination',
      'Logarithms', 'Coordinate Geometry', 'Quadrilaterals', 'Lines & Angles', 'HCF & LCM',
      'Divisibility', 'Remainders', 'Base System', 'Set Theory', 'Pipes & Cisterns']
    .map((topic): TopicCandidateInput => ({
      topic, coverageStatus: 'not_started', daysSinceLastPracticed: null, daysSincePlanned: null,
    })),
];

describe('Abhishek’s plan, 11 Aug — the regression', () => {
  const pace = syllabusPace({ untouchedTopics: 23, daysToTarget: 25 });

  it('BEFORE: with no pace pressure it served him a topic he had just done', () => {
    // The old behaviour, reproduced exactly by passing pressure 0 and no
    // repeat signal — this is what shipped, and what he complained about.
    const stripped = ABHISHEK_QA.map((c) => ({ ...c, daysSincePlanned: null }));
    const choice = chooseTopicForSection(stripped, 1, false, 0);
    expect(choice.coverageStatus).not.toBe('not_started');
  });

  it('AFTER: opens a topic he has never started', () => {
    const choice = chooseTopicForSection(ABHISHEK_QA, 1, false, pace.pressure);
    expect(choice.coverageStatus).toBe('not_started');
    expect(choice.reasons.join(' ')).toMatch(/New topic|Never started/i);
  });

  it('never serves Percentages the day after serving it', () => {
    const choice = chooseTopicForSection(ABHISHEK_QA, 1, false, pace.pressure);
    expect(choice.topic).not.toBe('Percentages');
  });

  it('opens a DIFFERENT new topic each day as they get consumed', () => {
    // Walk five days, marking each chosen topic as just-planned. If the engine
    // can still only see five topics, this collapses immediately.
    const seen: string[] = [];
    let pool = [...ABHISHEK_QA];
    for (let day = 0; day < 5; day++) {
      const choice = chooseTopicForSection(pool, 1, false, pace.pressure);
      seen.push(choice.topic);
      pool = pool.map((c) =>
        c.topic === choice.topic
          ? { ...c, daysSincePlanned: 0, coverageStatus: 'learning' as const }
          : { ...c, daysSincePlanned: c.daysSincePlanned == null ? null : c.daysSincePlanned + 1 }
      );
    }
    expect(new Set(seen).size, `repeated inside five days: ${seen.join(' → ')}`).toBe(5);
  });

  it('still respects "finish what you started" once the calendar allows it', () => {
    // Same student, imaginary comfortable deadline: revision leads again.
    const relaxed = syllabusPace({ untouchedTopics: 23, daysToTarget: 120 });
    expect(relaxed.pressure).toBe(0);
    const choice = chooseTopicForSection(ABHISHEK_QA, 1, false, relaxed.pressure);
    expect(choice.coverageStatus).not.toBe('not_started');
  });

  it('a student action still outranks the calendar', () => {
    // Priority does NOT outrank a heavily revision-overdue alternative — that
    // is documented, deliberate, and older than this fix. What it must beat is
    // the new-topic urgency we just added: the calendar may never override a
    // topic the student starred themselves.
    const starred = ABHISHEK_QA
      .filter((c) => c.coverageStatus === 'not_started' || c.topic === 'Percentages')
      .map((c) => (c.topic === 'Percentages' ? { ...c, priorityBonus: true, daysSincePlanned: 9 } : c));
    expect(chooseTopicForSection(starred, 1, false, pace.pressure).topic).toBe('Percentages');
  });
});
