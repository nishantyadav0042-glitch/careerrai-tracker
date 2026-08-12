import { describe, it, expect } from 'vitest';
import {
  findCohort, peerPulse, cohortInsights, selfVsObserved,
  phaseOf, intensityOf, isRepeater, MIN_COHORT, type PeerRow,
} from './peer-cohort';

// ── The peer engine speaks about real people ────────────────────────────────
//
// Every sentence this engine produces is a claim about students who exist. The
// tests that matter are therefore not "does it compute a mean" — they are the
// ones that prove it STAYS SILENT when it does not have the evidence, because
// that is the failure mode that ships a lie (Incident #7, Trust OS §2.1).

const YEAR = 2026;

function row(id: string, over: Partial<PeerRow> = {}): PeerRow {
  return {
    studentId: id,
    attemptYear: 2026,
    targetHours: 4,
    weakestSection: 'DILR',
    daysToExam: 120,
    loggedToday: false,
    loggedDaysLast7: 3,
    sectionsToday: [],
    observedAvgHours: 3,
    ...over,
  };
}

/** n students identical to the template, ids p0..p(n-1). */
function peers(n: number, over: Partial<PeerRow> = {}): PeerRow[] {
  return Array.from({ length: n }, (_, i) => row(`p${i}`, over));
}

describe('the bands are the ones the rest of the product already uses', () => {
  it('phases split on the planner boundaries, and null stays null', () => {
    expect(phaseOf(365)).toBe('foundation');
    expect(phaseOf(120)).toBe('building');
    expect(phaseOf(45)).toBe('sharpening');
    expect(phaseOf(10)).toBe('final');
    expect(phaseOf(null)).toBeNull();
  });

  it('intensity is a band, never false precision on a self-report', () => {
    expect(intensityOf(2)).toBe('light');
    expect(intensityOf(4.5)).toBe('steady');
    expect(intensityOf(9)).toBe('heavy');
    expect(intensityOf(0)).toBeNull();
    expect(intensityOf(null)).toBeNull();
  });

  it('repeater is null when unknown — never guessed from a missing field', () => {
    expect(isRepeater(2025, YEAR)).toBe(true);
    expect(isRepeater(2026, YEAR)).toBe(false);
    expect(isRepeater(null, YEAR)).toBeNull();
  });
});

describe('the cohort ladder — as specific as the evidence allows, never more', () => {
  it('uses the TIGHTEST cohort when enough real students back it', () => {
    const me = row('me');
    const match = findCohort(me, [me, ...peers(MIN_COHORT)], YEAR);
    expect(match).not.toBeNull();
    expect(match!.rung).toBe(0);
    expect(match!.label).toContain('first-attempt');
    expect(match!.label).toContain('DILR');
  });

  it('widens when the tight cohort is too thin — the 310-student case', () => {
    const me = row('me', { weakestSection: 'VARC' });
    // Nobody shares VARC, but plenty share phase + attempt.
    const match = findCohort(me, [me, ...peers(MIN_COHORT, { weakestSection: 'DILR' })], YEAR);
    expect(match!.rung).toBe(1);
    expect(match!.label).not.toContain('VARC');
  });

  it('falls all the way back to "everyone preparing" rather than inventing precision', () => {
    const me = row('me', { attemptYear: null, daysToExam: null, targetHours: null });
    const match = findCohort(me, [me, ...peers(MIN_COHORT, { daysToExam: 400 })], YEAR);
    expect(match!.rung).toBe(4);
    expect(match!.label).toBe('students preparing alongside you');
  });

  it('SAYS NOTHING when even the whole base is below the floor', () => {
    const me = row('me');
    expect(findCohort(me, [me, ...peers(MIN_COHORT - 1)], YEAR)).toBeNull();
  });

  it('never counts the student as their own peer', () => {
    const me = row('me');
    const match = findCohort(me, [me, ...peers(MIN_COHORT)], YEAR);
    expect(match!.peers.every((p) => p.studentId !== 'me')).toBe(true);
    expect(match!.peers).toHaveLength(MIN_COHORT);
  });
});

describe('presence — real counts, never rounded up to feel bigger', () => {
  it('counts only students who actually logged today', () => {
    const me = row('me', { sectionsToday: ['QA'] });
    const all = [me, ...peers(3, { loggedToday: true, sectionsToday: ['QA'] }), ...peers(4, { loggedToday: false })];
    const pulse = peerPulse(me, all);
    // The 4 non-loggers share ids with the first 3 (p0..p3), so dedupe by identity:
    expect(pulse.studiedToday).toBe(all.filter((r) => r.studentId !== 'me' && r.loggedToday).length);
  });

  it('reports 3 as 3 — a small real number is still the truth', () => {
    const me = row('me');
    const all = [me, ...peers(3, { loggedToday: true, sectionsToday: ['QA'] })];
    expect(peerPulse(me, all).studiedToday).toBe(3);
  });

  it('finds the section most studied today, breaking ties deterministically', () => {
    const me = row('me');
    const all = [
      me,
      row('a', { loggedToday: true, sectionsToday: ['QA'] }),
      row('b', { loggedToday: true, sectionsToday: ['DILR'] }),
    ];
    // 1 each — alphabetical wins, so the same day never renders two ways.
    expect(peerPulse(me, all).topSection).toEqual({ section: 'DILR', count: 1 });
  });

  it('counts a student once per section even if their log repeats it', () => {
    const me = row('me');
    const all = [me, row('a', { loggedToday: true, sectionsToday: ['QA', 'QA', 'QA'] })];
    expect(peerPulse(me, all).topSection).toEqual({ section: 'QA', count: 1 });
  });

  it('shows nobody studying when nobody studied — no floor, no fudge', () => {
    const me = row('me');
    const pulse = peerPulse(me, [me, ...peers(20, { loggedToday: false })]);
    expect(pulse.studiedToday).toBe(0);
    expect(pulse.topSection).toBeNull();
  });
});

describe('insights — a comparison or nothing', () => {
  it('stays completely silent below the cohort floor', () => {
    const me = row('me');
    expect(cohortInsights(me, [me, ...peers(MIN_COHORT - 1)], YEAR)).toEqual([]);
  });

  it('suppresses a difference too small to be real', () => {
    const me = row('me', { loggedDaysLast7: 4, observedAvgHours: 3.2 });
    const insights = cohortInsights(me, [me, ...peers(MIN_COHORT, { loggedDaysLast7: 3, observedAvgHours: 3 })], YEAR);
    expect(insights.find((i) => i.id === 'consistency')).toBeUndefined();
    expect(insights.find((i) => i.id === 'hours')).toBeUndefined();
  });

  it('speaks when the gap is material, and carries how many students back it', () => {
    const me = row('me', { loggedDaysLast7: 6 });
    const insights = cohortInsights(me, [me, ...peers(MIN_COHORT, { loggedDaysLast7: 2 })], YEAR);
    const c = insights.find((i) => i.id === 'consistency');
    expect(c).toBeDefined();
    expect(c!.basis).toBe(MIN_COHORT);
    expect(c!.line).toContain('6 of the last 7');
  });

  it('never shames the student who is behind — it states the peer fact', () => {
    const me = row('me', { loggedDaysLast7: 1 });
    const insights = cohortInsights(me, [me, ...peers(MIN_COHORT, { loggedDaysLast7: 6 })], YEAR);
    const line = insights.find((i) => i.id === 'consistency')!.line;
    for (const forbidden of ['should', 'failing', 'behind', 'only', 'lazy']) {
      expect(line.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('the shared-weakness line needs its OWN floor, not the cohort_s', () => {
    // A cohort of 6 where only 2 share a weak section must not produce
    // "2 students say DILR is their weakest too".
    const me = row('me');
    const mixed = [
      ...peers(2, { weakestSection: 'DILR' }),
      ...Array.from({ length: 4 }, (_, i) => row(`q${i}`, { weakestSection: 'VARC' })),
    ];
    const insights = cohortInsights(me, [me, ...mixed], YEAR);
    const shared = insights.find((i) => i.id === 'shared-weakness');
    if (shared) expect(shared.basis).toBeGreaterThanOrEqual(MIN_COHORT);
  });
});

describe('self vs observed — the gap the student cannot see', () => {
  it('needs no peers at all, so it works from week one', () => {
    const me = row('me', { targetHours: 6, observedAvgHours: 2, loggedDaysLast7: 4 });
    const r = selfVsObserved(me);
    expect(r).not.toBeNull();
    expect(r!.planTooBig).toBe(true);
  });

  it('blames the PLAN, never the student', () => {
    const me = row('me', { targetHours: 8, observedAvgHours: 1.5, loggedDaysLast7: 5 });
    const line = selfVsObserved(me)!.line;
    expect(line).toContain('the plan is the thing that is wrong');
    for (const forbidden of ['you failed', 'lazy', 'not serious', 'excuse']) {
      expect(line.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('stays quiet on one bad week — needs a pattern, not a day', () => {
    expect(selfVsObserved(row('me', { targetHours: 6, observedAvgHours: 1, loggedDaysLast7: 1 }))).toBeNull();
  });

  it('stays quiet when the plan is roughly right', () => {
    expect(selfVsObserved(row('me', { targetHours: 4, observedAvgHours: 3.5, loggedDaysLast7: 5 }))).toBeNull();
  });

  it('also notices a plan that is too SMALL — the signal runs both ways', () => {
    const r = selfVsObserved(row('me', { targetHours: 2, observedAvgHours: 5, loggedDaysLast7: 5 }));
    expect(r!.planTooBig).toBe(false);
    expect(r!.line).toContain('room to ask more');
  });

  it('says nothing when either side of the comparison is missing', () => {
    expect(selfVsObserved(row('me', { targetHours: null }))).toBeNull();
    expect(selfVsObserved(row('me', { observedAvgHours: null }))).toBeNull();
  });
});
