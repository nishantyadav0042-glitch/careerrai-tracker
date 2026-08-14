import { describe, it, expect } from 'vitest';
import {
  nextAsk, outstandingAsks, FIRST_WEEK_ASKS, FIRST_WEEK_DAYS,
  MIN_LOGS_BEFORE_ASKING, type AskContext,
} from './first-week-asks';

// ── The rest of the questions, in week one ──────────────────────────────────
//
// Founder, 14 Aug: "ask weakest section in onboarding, rest in first week."
//
// The danger with "collect it later" is that later becomes a stack of prompts
// on the home screen, which is a form, which is something to dismiss. These
// pin the restraint.

const ctx = (over: Partial<AskContext> = {}): AskContext => ({
  daysSinceSignup: 2,
  daysLogged: 1,
  answered: {},
  dismissedToday: [],
  askedToday: false,
  ...over,
});

describe('one question, and only when it is earned', () => {
  it('asks the highest-leverage question first', () => {
    // Value has to arrive even if a student answers exactly one.
    expect(nextAsk(ctx())?.id).toBe('weak_topic');
  });

  it('never asks twice in a day', () => {
    expect(nextAsk(ctx({ askedToday: true }))).toBeNull();
  });

  it('never asks a student who has not logged yet', () => {
    // Refining a plan they have not used is asking them to imagine their own
    // behaviour — and it puts a question in front of the one action that
    // matters on day one.
    expect(nextAsk(ctx({ daysLogged: 0 }))).toBeNull();
    expect(MIN_LOGS_BEFORE_ASKING).toBe(1);
  });

  it('stops after the first week', () => {
    expect(nextAsk(ctx({ daysSinceSignup: FIRST_WEEK_DAYS }))).not.toBeNull();
    expect(nextAsk(ctx({ daysSinceSignup: FIRST_WEEK_DAYS + 1 }))).toBeNull();
  });

  it('moves on once the leading question is answered', () => {
    const a = nextAsk(ctx({ answered: { self_reported_weak_topic: 'Geometry' } }));
    expect(a?.id).toBe('current_stage');
  });

  it('treats a null answer as answered, never as unasked', () => {
    // "Not sure" is a real answer, exactly as it is for the weakest section.
    // Re-asking it would punish the student for being honest.
    const a = nextAsk(ctx({ answered: { self_reported_weak_topic: null } }));
    expect(a?.id).toBe('current_stage');
  });

  it('respects a dismissal for the rest of the day', () => {
    const a = nextAsk(ctx({ dismissedToday: ['weak_topic'] }));
    expect(a?.id).toBe('current_stage');
  });

  it('goes quiet once everything is collected', () => {
    const answered = Object.fromEntries(FIRST_WEEK_ASKS.map((a) => [a.field, 'x']));
    expect(nextAsk(ctx({ answered }))).toBeNull();
    expect(outstandingAsks(answered)).toEqual([]);
  });
});

describe('every ask exists to fill a real plan input', () => {
  it('names the profile column it writes', () => {
    // An ask that does not fill a planner input is a question we have no right
    // to a student's attention for.
    for (const a of FIRST_WEEK_ASKS) {
      expect(a.field, a.id).toMatch(/^[a-z_]+$/);
      expect(a.question.length).toBeGreaterThan(0);
      expect(a.why.length).toBeGreaterThan(0);
    }
  });

  it('covers exactly the inputs the founder deferred', () => {
    expect(FIRST_WEEK_ASKS.map((a) => a.field).sort()).toEqual(
      ['current_stage', 'self_reported_weak_topic', 'start_with'].sort(),
    );
  });

  it('orders them by how much they change the plan', () => {
    const order = FIRST_WEEK_ASKS.map((a) => a.leverage);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    // weak_topic moves the priority slice within the weak section; start_with
    // only biases which QA cluster opens first.
    expect(FIRST_WEEK_ASKS[0].id).toBe('weak_topic');
    expect(FIRST_WEEK_ASKS[FIRST_WEEK_ASKS.length - 1].id).toBe('start_with');
  });
});

describe('what is still missing is countable', () => {
  it('reports the gap, so this can never go unseen again', () => {
    // The failure that started this: inputs nobody filled and nobody could
    // see. A number that can be read at a glance is what prevents a repeat.
    expect(outstandingAsks({})).toHaveLength(FIRST_WEEK_ASKS.length);
    expect(outstandingAsks({ current_stage: 'foundation' })).toHaveLength(FIRST_WEEK_ASKS.length - 1);
  });
});
