import { describe, it, expect } from 'vitest';
import { computeFunnel, reachedStage, STAGES, type FunnelStudent } from './activation-funnel';

function student(over: Partial<FunnelStudent>): FunnelStudent {
  return {
    id: 'x', name: 'S', phone: null,
    createdAt: '2026-08-01T05:00:00Z',   // IST day 2026-08-01
    planSource: 'self',
    onboarded: false, planBuilt: false, tickedTask: false, logged: false,
    activityDays: [],
    ...over,
  };
}

describe('the Founder Funnel — stages are provable and cumulative', () => {
  it('a fully-activated student reaches every stage', () => {
    const s = student({
      onboarded: true, planBuilt: true, tickedTask: true, logged: true,
      activityDays: ['2026-08-01', '2026-08-02', '2026-08-09'],
    });
    for (const { key } of STAGES) expect(reachedStage(s, key), key).toBe(true);
  });

  it('a signup who never returned reaches only stage 1', () => {
    const s = student({ activityDays: ['2026-08-01'] });
    expect(reachedStage(s, 'signed_up')).toBe(true);
    expect(reachedStage(s, 'day2_return')).toBe(false);
    expect(reachedStage(s, 'week1_retained')).toBe(false);
  });

  it('day-2 return means activity on day +1 or +2, not the signup day itself', () => {
    expect(reachedStage(student({ activityDays: ['2026-08-02'] }), 'day2_return')).toBe(true);
    expect(reachedStage(student({ activityDays: ['2026-08-05'] }), 'day2_return')).toBe(false);
    expect(reachedStage(student({ activityDays: ['2026-08-08'] }), 'week1_retained')).toBe(true);
  });

  it('stages are CUMULATIVE — counts can only fall, and each leak is one step', () => {
    const list = [
      student({ id: 'a', onboarded: true, planBuilt: true, tickedTask: true, logged: true, activityDays: ['2026-08-01', '2026-08-02', '2026-08-08'] }),
      student({ id: 'b', onboarded: true, planBuilt: true }),   // built, never touched
      student({ id: 'c' }),                                      // signed up, vanished
    ];
    const funnel = computeFunnel(list);
    const counts = funnel.map((s) => s.members.length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    // c leaks at onboarding; b leaks at first tick; a survives to the end.
    expect(funnel.find((s) => s.key === 'onboarded')!.leak.map((x) => x.id)).toEqual(['c']);
    expect(funnel.find((s) => s.key === 'first_tick')!.leak.map((x) => x.id)).toEqual(['b']);
    expect(funnel[funnel.length - 1].members.map((x) => x.id)).toEqual(['a']);
  });

  it('every stage keeps its exact members — the number IS the list (drill-down law)', () => {
    const funnel = computeFunnel([student({ id: 'a', onboarded: true }), student({ id: 'b' })]);
    for (const s of funnel) expect(s.members.length + s.leak.length).toBeGreaterThanOrEqual(s.members.length);
    expect(funnel[1].members.map((m) => m.id)).toEqual(['a']);
  });
});
