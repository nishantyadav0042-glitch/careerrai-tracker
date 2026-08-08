import { describe, it, expect } from 'vitest';
import {
  computeReplan, droppableTopics, DROPPABLE_MAX_WEIGHTAGE, MAX_SUSTAINABLE_HOURS,
} from './replan-engine';
import { TOPIC_METADATA } from './topics-constants';
import type { TopicStatusRow } from './study-pace';

// The founder's requirement for this engine was "precise and trustworthy" —
// a buddy has to defend every number on a live call. These tests pin the
// promises that make it defensible, not just that it returns something.

const ALL_TOPICS = Object.keys(TOPIC_METADATA);
const coverageAll = (status: string): TopicStatusRow[] => ALL_TOPICS.map((t) => ({ topic: t, status }));
const TODAY = new Date('2026-08-05T00:00:00Z');

describe('on-track students are left alone', () => {
  it('returns no options when the committed pace already covers the work', () => {
    const r = computeReplan({
      coverage: coverageAll('exam_ready'),          // ~5% of each topic left
      targetDate: new Date('2026-11-20T00:00:00Z'), // plenty of runway
      committedPerDay: 8, effortMultiplier: 1, today: TODAY,
    });
    expect(r.onTrack).toBe(true);
    expect(r.options).toHaveLength(0);
    expect(r.recommended).toBeNull();
  });
});

describe('a behind student gets exactly four honest options', () => {
  const behind = () => computeReplan({
    coverage: coverageAll('not_started'),
    targetDate: new Date('2026-09-17T00:00:00Z'),
    committedPerDay: 4, effortMultiplier: 1, today: TODAY,
  });

  it('offers keep_date, keep_hours, balanced and cut_scope — always all four', () => {
    expect(behind().options.map((o) => o.kind))
      .toEqual(['keep_date', 'keep_hours', 'balanced', 'cut_scope']);
  });

  it('keep_date holds the date and only raises hours', () => {
    const o = behind().options.find((x) => x.kind === 'keep_date')!;
    expect(o.finishDate).toBe('2026-09-17');
    expect(o.hoursPerDay).toBeGreaterThan(4);
    expect(o.droppedTopics).toEqual([]);
  });

  it('keep_hours holds the hours and only moves the date', () => {
    const o = behind().options.find((x) => x.kind === 'keep_hours')!;
    expect(o.hoursPerDay).toBe(4);
    expect(new Date(o.finishDate).getTime()).toBeGreaterThan(new Date('2026-09-17').getTime());
  });

  it('balanced lands strictly between the two', () => {
    const r = behind();
    const b = r.options.find((x) => x.kind === 'balanced')!;
    expect(b.hoursPerDay).toBeGreaterThan(4);
    expect(b.hoursPerDay).toBeLessThan(r.requiredPerDay);
  });

  it('every option carries receipts a buddy can read out', () => {
    for (const o of behind().options) {
      expect(o.receipts.length, `${o.kind} has no receipts`).toBeGreaterThan(0);
      expect(o.receipts.join(' ')).toMatch(/hrs/);
    }
  });

  it('recommends a FEASIBLE option, never an impossible one', () => {
    const r = behind();
    if (r.recommended) {
      expect(r.options.find((o) => o.kind === r.recommended)!.feasible).toBe(true);
    }
  });
});

describe('the guards that make this trustworthy', () => {
  it('marks an unsustainable hours demand INFEASIBLE instead of returning it as advice', () => {
    const r = computeReplan({
      coverage: coverageAll('not_started'),
      targetDate: new Date('2026-08-20T00:00:00Z'), // 15 days for the whole syllabus
      committedPerDay: 4, effortMultiplier: 1, today: TODAY,
    });
    const a = r.options.find((o) => o.kind === 'keep_date')!;
    expect(a.hoursPerDay).toBeGreaterThan(MAX_SUSTAINABLE_HOURS);
    expect(a.feasible).toBe(false);
    expect(a.warning).toMatch(/not sustainable/i);
  });

  it('never hands back a finish date after CAT without flagging it', () => {
    const r = computeReplan({
      coverage: coverageAll('not_started'),
      targetDate: new Date('2026-09-17T00:00:00Z'),
      committedPerDay: 0.5, effortMultiplier: 1, today: TODAY,   // absurdly low → date runs past CAT
    });
    const b = r.options.find((o) => o.kind === 'keep_hours')!;
    expect(b.feasible).toBe(false);
    expect(b.warning).toMatch(/after CAT/i);
  });

  it('NEVER drops a high-weightage topic — not even to save a date', () => {
    const r = computeReplan({
      coverage: coverageAll('not_started'),
      targetDate: new Date('2026-09-17T00:00:00Z'),
      committedPerDay: 4, effortMultiplier: 1, today: TODAY,
    });
    const d = r.options.find((o) => o.kind === 'cut_scope')!;
    for (const t of d.droppedTopics) {
      expect(TOPIC_METADATA[t].weightage,
        `${t} (weightage ${TOPIC_METADATA[t]?.weightage}) must never be droppable`)
        .toBeLessThanOrEqual(DROPPABLE_MAX_WEIGHTAGE);
    }
    // The topics that carry the exam are specifically protected.
    for (const must of ['Reading Comprehension', 'Percentages', 'Ratio & Proportion', 'Arrangements']) {
      expect(d.droppedTopics).not.toContain(must);
    }
  });

  it('admits defeat rather than over-cutting when scope cannot close the gap', () => {
    const r = computeReplan({
      coverage: coverageAll('not_started'),
      targetDate: new Date('2026-08-12T00:00:00Z'), // one week for everything
      committedPerDay: 4, effortMultiplier: 1, today: TODAY,
    });
    const d = r.options.find((o) => o.kind === 'cut_scope')!;
    expect(d.feasible).toBe(false);
    expect(d.warning).toMatch(/cannot be closed by cutting syllabus/i);
  });

  it('will not sacrifice work already in progress (revising/practicing topics)', () => {
    const rows: TopicStatusRow[] = ALL_TOPICS.map((t) => ({ topic: t, status: 'revising' }));
    expect(droppableTopics(rows)).toHaveLength(0);
  });
});

describe('paused days (exams, travel, illness) shrink the usable window', () => {
  it('a pause raises the hours the same date demands', () => {
    const base = { coverage: coverageAll('not_started'), targetDate: new Date('2026-10-15T00:00:00Z'), committedPerDay: 4, effortMultiplier: 1, today: TODAY };
    const withoutPause = computeReplan(base);
    const withPause = computeReplan({ ...base, pausedDays: 10 });
    expect(withPause.daysToTarget).toBe(withoutPause.daysToTarget - 10);
    expect(withPause.requiredPerDay).toBeGreaterThan(withoutPause.requiredPerDay);
  });

  it('a pause pushes the keep_hours finish date out by the paused days', () => {
    const base = { coverage: coverageAll('not_started'), targetDate: new Date('2026-10-15T00:00:00Z'), committedPerDay: 5, effortMultiplier: 1, today: TODAY };
    const a = computeReplan(base).options.find((o) => o.kind === 'keep_hours')!;
    const b = computeReplan({ ...base, pausedDays: 7 }).options.find((o) => o.kind === 'keep_hours')!;
    const diff = (new Date(b.finishDate).getTime() - new Date(a.finishDate).getTime()) / 86_400_000;
    expect(diff).toBe(7);
  });
});

describe('the maths is internally consistent', () => {
  it('total = syllabus + mocks, and mocks are never forgotten', () => {
    const r = computeReplan({
      coverage: coverageAll('not_started'),
      targetDate: new Date('2026-09-17T00:00:00Z'),
      committedPerDay: 4, effortMultiplier: 1, today: TODAY,
    });
    expect(r.totalHoursNeeded).toBe(r.remainingSyllabusHours + r.mockHours);
    expect(r.mockHours).toBeGreaterThan(0);
    expect(r.headline).toContain('hrs/day');
  });

  it('keep_hours actually delivers the hours it promises', () => {
    const r = computeReplan({
      coverage: coverageAll('learning'),
      targetDate: new Date('2026-09-17T00:00:00Z'),
      committedPerDay: 3, effortMultiplier: 1, today: TODAY,
    });
    const b = r.options.find((o) => o.kind === 'keep_hours')!;
    const days = (new Date(b.finishDate).getTime() - TODAY.getTime()) / 86_400_000;
    expect(days * b.hoursPerDay).toBeGreaterThanOrEqual(r.totalHoursNeeded - b.hoursPerDay);
  });
});

describe('evidence beats aspiration (found by running this on live data)', () => {
  // Our first premium student declared 12 hrs/day and had logged 2 sessions
  // ever. A committed-only engine called him "on track" for a date he could
  // not hit. An engine that flatters is worse than no engine.
  const base = {
    coverage: coverageAll('learning'),
    targetDate: new Date('2026-09-02T00:00:00Z'),
    committedPerDay: 12, effortMultiplier: 1,
    today: TODAY,
  };

  it('a declared-but-unlived pace no longer earns an on-track verdict', () => {
    const flattering = computeReplan(base);                       // trusts the claim
    const honest = computeReplan({ ...base, observedPerDay: 2 }); // trusts the logs
    expect(flattering.onTrack).toBe(true);
    expect(honest.onTrack).toBe(false);
    expect(honest.paceSource).toBe('observed');
  });

  it('names the gap between planned and real, out loud', () => {
    const r = computeReplan({ ...base, observedPerDay: 2 });
    expect(r.headline).toContain('averaging 2');
    expect(r.headline).toContain("you'd planned 12");
  });

  it('builds every option from the REAL pace, not the claimed one', () => {
    const r = computeReplan({ ...base, observedPerDay: 2 });
    expect(r.options.find((o) => o.kind === 'keep_hours')!.hoursPerDay).toBe(2);
  });

  it('falls back to the committed number only when there are no logs yet', () => {
    const r = computeReplan({ ...base, observedPerDay: null });
    expect(r.paceSource).toBe('committed');
    expect(r.pacePerDay).toBe(12);
  });
});
