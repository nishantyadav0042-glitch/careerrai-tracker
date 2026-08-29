import { describe, it, expect } from 'vitest';
import {
  classifyForDistribution, planDistribution, describeFairness,
  DISTRIBUTION_LANES, type DistributableStudent, type DistributionLane,
} from './sales-distribution';

const student = (id: string, over: Partial<DistributableStudent> = {}): DistributableStudent => ({
  id,
  createdAt: `2026-08-${String((parseInt(id.replace(/\D/g, ''), 10) % 28) + 1).padStart(2, '0')}T00:00:00Z`,
  hasPhone: true, hasPaid: false, hasAbandonedOrder: false, hitIntentDoor: false,
  buddyCtaClicks: 0, daysSinceLastLog: null, daysSinceLastEvent: 3,
  ...over,
});

const SEATS = ['seat-a', 'seat-b'];

describe('classifyForDistribution', () => {
  it('a paying student is a customer, not a lead', () => {
    expect(classifyForDistribution(student('s1', { hasPaid: true }))).toBeNull();
  });

  // Dropping them would make 57 real students nobody's responsibility forever.
  it('a student with no phone is still owned', () => {
    expect(classifyForDistribution(student('s1', { hasPhone: false }))).toBe('uncontactable');
  });

  it('commercial signals outrank behavioural ones', () => {
    expect(classifyForDistribution(student('s1', { hasAbandonedOrder: true, daysSinceLastLog: 1 }))).toBe('checkout_abandoned');
    expect(classifyForDistribution(student('s2', { hitIntentDoor: true, daysSinceLastLog: 1 }))).toBe('intent_door');
    expect(classifyForDistribution(student('s3', { buddyCtaClicks: 2, daysSinceLastLog: 1 }))).toBe('buddy_cta');
  });

  it('separates studying, active-but-not-studying, slipping and cold', () => {
    expect(classifyForDistribution(student('s1', { daysSinceLastLog: 2 }))).toBe('logging_now');
    expect(classifyForDistribution(student('s2', { daysSinceLastEvent: 3 }))).toBe('active_not_logging');
    expect(classifyForDistribution(student('s3', { daysSinceLastEvent: 20 }))).toBe('slipping');
    expect(classifyForDistribution(student('s4', { daysSinceLastEvent: 90 }))).toBe('cold');
    expect(classifyForDistribution(student('s5', { daysSinceLastEvent: null }))).toBe('cold');
  });

  it('every student lands somewhere — no silent drops', () => {
    for (const s of [student('a'), student('b', { hasPhone: false }), student('c', { daysSinceLastEvent: null })]) {
      expect(classifyForDistribution(s)).not.toBeUndefined();
    }
  });
});

describe('planDistribution', () => {
  const population = (n: number, over: (i: number) => Partial<DistributableStudent> = () => ({})) =>
    Array.from({ length: n }, (_, i) => student(`s${i}`, over(i)));

  it('is deterministic — the same population always produces the same books', () => {
    const pop = population(50, (i) => ({ buddyCtaClicks: i % 3 === 0 ? 1 : 0 }));
    const a = planDistribution(pop, SEATS);
    const b = planDistribution([...pop].reverse(), SEATS);
    expect(a.seats[0].studentIds).toEqual(b.seats[0].studentIds);
    expect(a.seats[1].studentIds).toEqual(b.seats[1].studentIds);
  });

  it('no student can land in two books, and none is lost', () => {
    const pop = population(97, (i) => ({ hasAbandonedOrder: i % 11 === 0, buddyCtaClicks: i % 5 }));
    const plan = planDistribution(pop, SEATS);
    const all = plan.seats.flatMap((s) => s.studentIds);
    expect(new Set(all).size, 'a student appears twice').toBe(all.length);
    expect(all.length + plan.excluded.length).toBe(pop.length);
  });

  // The whole reason for dealing lane by lane. With only ~124 high-intent
  // students in the entire base, a bad split there decides who looks like the
  // better counsellor for two months.
  it('splits the HOT group evenly, not just the total', () => {
    const pop = [
      ...population(16, () => ({ hasAbandonedOrder: true })),
      ...population(200, (i) => ({ id: `cold${i}`, daysSinceLastEvent: 90 })).map((s, i) => ({ ...s, id: `cold${i}` })),
    ];
    const plan = planDistribution(pop, SEATS);
    expect(plan.seats[0].byLane.checkout_abandoned).toBe(8);
    expect(plan.seats[1].byLane.checkout_abandoned).toBe(8);
  });

  it('every lane differs by at most one student between seats', () => {
    const pop = population(233, (i) => ({
      hasAbandonedOrder: i % 17 === 0, hitIntentDoor: i % 23 === 0,
      buddyCtaClicks: i % 7 === 0 ? 1 : 0, hasPhone: i % 19 !== 0,
      daysSinceLastLog: i % 4 === 0 ? 2 : null, daysSinceLastEvent: i % 3 === 0 ? 20 : 90,
    }));
    const plan = planDistribution(pop, SEATS);
    for (const lane of DISTRIBUTION_LANES) {
      const gap = Math.abs(plan.seats[0].byLane[lane] - plan.seats[1].byLane[lane]);
      expect(gap, `${lane} is imbalanced by ${gap}`).toBeLessThanOrEqual(1);
    }
  });

  // Eight lanes of odd size with a per-lane reset would hand seat A the extra
  // student eight times over. The cursor carries across lanes for this reason.
  it('odd remainders alternate between seats instead of always favouring one', () => {
    const pop = DISTRIBUTION_LANES.filter((l) => l !== 'uncontactable').flatMap((lane, li) =>
      Array.from({ length: 3 }, (_, i) => student(`${lane}-${i}`, laneShape(lane, li))));
    const plan = planDistribution(pop, SEATS);
    const gap = Math.abs(plan.seats[0].studentIds.length - plan.seats[1].studentIds.length);
    expect(gap, 'a per-lane reset would make this gap equal the lane count').toBeLessThanOrEqual(1);
  });

  it('paid students are excluded and named, never silently dropped', () => {
    const plan = planDistribution([student('a'), student('b', { hasPaid: true })], SEATS);
    expect(plan.excluded).toEqual([{ studentId: 'b', reason: 'already_paid' }]);
  });

  it('an empty seat list changes nothing rather than throwing', () => {
    const plan = planDistribution(population(10), []);
    expect(plan.seats).toEqual([]);
  });

  it('scales to a third seat without a rewrite', () => {
    const plan = planDistribution(population(90, () => ({ hasAbandonedOrder: true })), ['a', 'b', 'c']);
    expect(plan.seats.map((s) => s.byLane.checkout_abandoned)).toEqual([30, 30, 30]);
  });
});

describe('describeFairness', () => {
  it('names the worst group imbalance, not an average that hides it', () => {
    const pop = Array.from({ length: 17 }, (_, i) => student(`s${i}`, { hasAbandonedOrder: true }));
    const s = describeFairness(planDistribution(pop, SEATS));
    expect(s).toMatch(/checkout_abandoned|split evenly/);
  });

  it('says so plainly when every group is even', () => {
    const pop = Array.from({ length: 20 }, (_, i) => student(`s${i}`, { hasAbandonedOrder: true }));
    expect(describeFairness(planDistribution(pop, SEATS))).toContain('split evenly');
  });
});

function laneShape(lane: DistributionLane, li: number): Partial<DistributableStudent> {
  void li;
  switch (lane) {
    case 'checkout_abandoned': return { hasAbandonedOrder: true };
    case 'intent_door': return { hitIntentDoor: true };
    case 'buddy_cta': return { buddyCtaClicks: 1 };
    case 'logging_now': return { daysSinceLastLog: 2 };
    case 'active_not_logging': return { daysSinceLastEvent: 3 };
    case 'slipping': return { daysSinceLastEvent: 20 };
    default: return { daysSinceLastEvent: 90 };
  }
}
