import { describe, it, expect } from 'vitest';
import { planReason, type PlanReasonInput } from './plan-reason';

// The one rule this module enforces: we only ever say "because of your log"
// when it is actually true. Every test below is either a claim that must be
// made when its evidence exists, or a claim that must NOT be made when it
// doesn't. A weaker sentence beats a false one, always.

const base: PlanReasonInput = {
  todayTasks: [{ topic: 'Geometry' }, { topic: 'Reading Comprehension' }],
  yesterday: { total: 3, done: 1 },
  yesterdayUnfinishedTopics: [],
  postponedTopics: [],
  dayOutcome: null,
  blockerReason: null,
  adaptationVolumeFactor: null,
};
const input = (over: Partial<PlanReasonInput> = {}): PlanReasonInput => ({ ...base, ...over });

describe('the carried topic — the strongest proof of the loop', () => {
  it('names the topic and says FIRST when it actually is first', () => {
    const r = planReason(input({ yesterdayUnfinishedTopics: ['Geometry'] }))!;
    expect(r.kind).toBe('carried');
    expect(r.line).toBe("Geometry first — it didn't get finished yesterday.");
  });

  it('never claims "first" for a topic that is not first', () => {
    const r = planReason(input({ yesterdayUnfinishedTopics: ['Reading Comprehension'] }))!;
    expect(r.kind).toBe('carried');
    expect(r.line).toContain('Reading Comprehension is back');
    expect(r.line).not.toContain('first —');
  });

  it('never claims a carry that today does not actually contain', () => {
    const r = planReason(input({ yesterdayUnfinishedTopics: ['Algebra'] }));
    // Algebra was unfinished but is NOT on today's plan — saying "Algebra is
    // back" would be a lie. Falls through to whatever else is true.
    expect(r?.kind).not.toBe('carried');
  });
});

describe('the lightened claim needs BOTH halves true', () => {
  it('fires when they said too-heavy AND the engine actually reduced volume', () => {
    const r = planReason(input({ blockerReason: 'plan_too_heavy', adaptationVolumeFactor: 0.85 }))!;
    expect(r.kind).toBe('lightened');
  });

  it('does not claim "lighter" on sympathy alone', () => {
    // They said too heavy, but the engine did not reduce anything. Claiming
    // "today is lighter" would be checkably false the moment they count tasks.
    const r = planReason(input({ blockerReason: 'plan_too_heavy', adaptationVolumeFactor: null }));
    expect(r?.kind).not.toBe('lightened');
    const r2 = planReason(input({ blockerReason: 'plan_too_heavy', adaptationVolumeFactor: 1.0 }));
    expect(r2?.kind).not.toBe('lightened');
  });

  it('does not claim "lighter" for a different blocker', () => {
    const r = planReason(input({ blockerReason: 'office', adaptationVolumeFactor: 0.85 }));
    expect(r?.kind).not.toBe('lightened');
  });
});

describe('the honest fallbacks', () => {
  it('celebrates a clean sweep with the real number', () => {
    const r = planReason(input({ yesterday: { total: 3, done: 3 } }))!;
    expect(r.kind).toBe('built_on');
    expect(r.line).toContain('All 3 done yesterday');
  });

  it('welcomes back from a rest day without a lecture', () => {
    const r = planReason(input({ dayOutcome: 'skipped' }))!;
    expect(r.kind).toBe('rest_return');
    expect(r.line.toLowerCase()).not.toContain('catch up');
  });

  it('frames a lost day as a restart, never guilt', () => {
    const r = planReason(input({ dayOutcome: 'not_studied' }))!;
    expect(r.kind).toBe('restart');
    for (const banned of ['missed', 'failed', 'behind', 'lazy']) {
      expect(r.line.toLowerCase()).not.toContain(banned);
    }
  });

  it('says NOTHING when nothing specific is true', () => {
    // A partially-done yesterday with no carried topic, no postponement, no
    // check-in — there is no specific true claim, so the answer is silence
    // and the UI's generic line, not an invented connection.
    expect(planReason(input())).toBeNull();
  });
});

describe('priority — the strongest true claim wins', () => {
  it('prefers the carried topic over everything else', () => {
    const r = planReason(input({
      yesterdayUnfinishedTopics: ['Geometry'],
      postponedTopics: ['Reading Comprehension'],
      dayOutcome: 'skipped',
      blockerReason: 'plan_too_heavy',
      adaptationVolumeFactor: 0.8,
    }))!;
    expect(r.kind).toBe('carried');
  });

  it('prefers the explicit postponement over the generic outcomes', () => {
    const r = planReason(input({ postponedTopics: ['Geometry'], dayOutcome: 'skipped' }))!;
    expect(r.kind).toBe('postponed');
  });
});

describe('robustness', () => {
  it('survives legacy tasks with null topics', () => {
    const r = planReason(input({
      todayTasks: [{ topic: null }, { topic: 'Geometry' }],
      yesterdayUnfinishedTopics: ['Geometry'],
    }))!;
    expect(r.kind).toBe('carried');
    // Geometry is first among REAL topics even though a null-topic task
    // precedes it — "first" refers to what the student can actually see named.
    expect(r.line).toContain('Geometry first');
  });

  it('survives an empty plan and no history at all', () => {
    expect(planReason({
      todayTasks: [], yesterday: null, yesterdayUnfinishedTopics: [],
      postponedTopics: [], dayOutcome: null, blockerReason: null,
      adaptationVolumeFactor: null,
    })).toBeNull();
  });
});
