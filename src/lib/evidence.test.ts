import { describe, it, expect } from 'vitest';
import { deriveStatus, mergeStatus, topicEvidence, targetsFor, type EvidenceRow, type EvidenceCheck } from './evidence';
import { STATUS_ORDER, type CoverageStatus } from './coverage-status';

// evidence.ts holds the app's strongest claim — that a topic is exam ready —
// and the rules that stop that claim being cheap. Three separate incidents are
// encoded below as tests:
//
//  1. A derived status written straight back would have demoted 209 students
//     to 'not_started' on deploy. mergeStatus is forward-only because of it.
//  2. exam_ready leaked in via a path that skipped validation: 10 rows across
//     6 students in 8 days. Only six passing checks may produce it.
//  3. One logged mock ticked "tested under exam conditions" for all 46 topics
//     at once, including topics never opened. The mock route now requires
//     practice to exist.
//
// A fourth rule has no incident yet and is the reason the module exists at all:
// volume alone must never clear a rung. 200 questions at 34% is not progress.

const check = (id: EvidenceCheck['id'], done: boolean): EvidenceCheck =>
  ({ id, label: id, done, detail: '' });

const ALL_IDS: EvidenceCheck['id'][] = ['concept', 'easy', 'medium', 'hard', 'revision', 'tested'];
const allChecks = (done: boolean) => ALL_IDS.map((id) => check(id, done));

describe('deriveStatus — the stage is computed, never declared', () => {
  it('returns exam_ready only when every check passes', () => {
    expect(deriveStatus(allChecks(true))).toBe('exam_ready');
  });

  it('never returns exam_ready when any single check fails', () => {
    for (const missing of ALL_IDS) {
      const checks = ALL_IDS.map((id) => check(id, id !== missing));
      expect(deriveStatus(checks)).not.toBe('exam_ready');
    }
  });

  it('walks the ladder in order as rungs are cleared', () => {
    const only = (...done: EvidenceCheck['id'][]) =>
      ALL_IDS.map((id) => check(id, done.includes(id)));

    expect(deriveStatus(allChecks(false))).toBe('not_started');
    expect(deriveStatus(only('concept'))).toBe('learning');
    expect(deriveStatus(only('concept', 'easy'))).toBe('practicing');
    expect(deriveStatus(only('concept', 'easy', 'hard'))).toBe('revising');
  });

  it('cannot be tricked into exam_ready by a SHORT array of checks', () => {
    // `checks.every(c => c.done)` is vacuously true on a subset. The one caller
    // always passes six, so this never fired in production — but the strongest
    // claim in the product must not depend on a caller remembering that.
    expect(deriveStatus([check('concept', true)])).not.toBe('exam_ready');
    expect(deriveStatus([check('concept', true), check('easy', true)])).not.toBe('exam_ready');
    expect(deriveStatus([])).toBe('not_started');
  });
});

describe('mergeStatus — evidence earns ground, it never takes it away', () => {
  it('never demotes a declared status (the 209-student regression)', () => {
    for (const declared of STATUS_ORDER) {
      for (const derived of STATUS_ORDER) {
        const result = mergeStatus(declared, derived);
        // The one intended demotion: a DECLARED exam_ready is capped at
        // 'revising', because exam_ready may only ever be earned.
        const floor: CoverageStatus = declared === 'exam_ready' ? 'revising' : declared;
        expect(STATUS_ORDER.indexOf(result)).toBeGreaterThanOrEqual(STATUS_ORDER.indexOf(floor));
      }
    }
  });

  it('promotes when the evidence is ahead of the declaration', () => {
    expect(mergeStatus('learning', 'revising')).toBe('revising');
    expect(mergeStatus('not_started', 'practicing')).toBe('practicing');
  });

  it('keeps the declaration when the evidence is behind it', () => {
    expect(mergeStatus('revising', 'learning')).toBe('revising');
    expect(mergeStatus('practicing', 'not_started')).toBe('practicing');
  });

  it('caps a self-declared exam_ready at revising — it may only be earned', () => {
    expect(mergeStatus('exam_ready', 'not_started')).toBe('revising');
    expect(mergeStatus('exam_ready', 'learning')).toBe('revising');
    expect(mergeStatus('exam_ready', 'revising')).toBe('revising');
  });

  it('is the ONLY way to reach exam_ready — derived evidence', () => {
    expect(mergeStatus('exam_ready', 'exam_ready')).toBe('exam_ready');
    expect(mergeStatus('not_started', 'exam_ready')).toBe('exam_ready');
    // No declared value alone can produce it.
    const reachable = STATUS_ORDER.map((d) => mergeStatus(d, 'revising'));
    expect(reachable).not.toContain('exam_ready');
  });

  it('is idempotent — merging its own output changes nothing', () => {
    for (const declared of STATUS_ORDER) {
      for (const derived of STATUS_ORDER) {
        const once = mergeStatus(declared, derived);
        expect(mergeStatus(once, derived)).toBe(once);
      }
    }
  });
});

describe('a rung needs volume AND accuracy — the Problem 4 rule', () => {
  const TOPIC = 'Averages';
  const row = (over: Partial<EvidenceRow>): EvidenceRow => ({
    topic: TOPIC, section: 'QA', difficulty: 'easy', attempted: 0, correct: 0,
    loggedFor: '2026-07-26', ...over,
  });
  const today = new Date('2026-07-26T12:00:00+05:30');
  const easyOf = (rows: EvidenceRow[]) =>
    topicEvidence(TOPIC, { rows, conceptReported: true, lastMockDaysAgo: null, today })
      .checks.find((c) => c.id === 'easy')!;

  it('does not clear a rung on volume at a poor hit rate', () => {
    const need = targetsFor(TOPIC).easy;
    const heavy = easyOf([row({ attempted: need * 3, correct: Math.round(need * 3 * 0.34) })]);
    expect(heavy.done).toBe(false);
  });

  it('clears the rung on less volume at a strong hit rate', () => {
    const need = targetsFor(TOPIC).easy;
    const sharp = easyOf([row({ attempted: need, correct: Math.round(need * 0.81) })]);
    expect(sharp.done).toBe(true);
  });

  it('does not clear a rung on accuracy alone without volume', () => {
    const perfectButTiny = easyOf([row({ attempted: 4, correct: 4 })]);
    expect(perfectButTiny.done).toBe(false);
  });

  it('scales required volume with the topic, and clamps at both ends', () => {
    for (const topic of ['Averages', 'Reading Comprehension', 'Set Theory']) {
      const t = targetsFor(topic);
      expect(t.easy).toBeGreaterThanOrEqual(10);
      expect(t.easy).toBeLessThanOrEqual(60);
      expect(t.hard).toBeGreaterThanOrEqual(5);
      expect(t.hard).toBeLessThanOrEqual(25);
      // Harder rungs always ask for fewer questions than easier ones.
      expect(t.timed).toBeLessThanOrEqual(t.hard);
      expect(t.hard).toBeLessThanOrEqual(t.medium);
      expect(t.medium).toBeLessThanOrEqual(t.easy);
    }
  });
});

describe('a mock cannot validate work that does not exist', () => {
  const TOPIC = 'Averages';
  const today = new Date('2026-07-26T12:00:00+05:30');
  const testedCheck = (rows: EvidenceRow[], lastMockDaysAgo: number | null) =>
    topicEvidence(TOPIC, { rows, conceptReported: true, lastMockDaysAgo, today })
      .checks.find((c) => c.id === 'tested')!;

  it('does not tick "tested" for an untouched topic just because a mock happened', () => {
    expect(testedCheck([], 3).done).toBe(false);
  });

  it('ticks "tested" when a recent mock backs up real practice', () => {
    const rows: EvidenceRow[] = [{
      topic: TOPIC, section: 'QA', difficulty: 'easy',
      attempted: 20, correct: 16, loggedFor: '2026-07-25',
    }];
    expect(testedCheck(rows, 3).done).toBe(true);
  });

  it('ignores a stale mock', () => {
    const rows: EvidenceRow[] = [{
      topic: TOPIC, section: 'QA', difficulty: 'easy',
      attempted: 20, correct: 16, loggedFor: '2026-07-25',
    }];
    expect(testedCheck(rows, 45).done).toBe(false);
  });
});

describe('topicEvidence reports its own inputs honestly', () => {
  const today = new Date('2026-07-26T12:00:00+05:30');

  it('reports null accuracy rather than 0% when nothing was attempted', () => {
    const ev = topicEvidence('Averages', { rows: [], conceptReported: false, lastMockDaysAgo: null, today });
    expect(ev.accuracyPct).toBeNull();
    expect(ev.attempted).toBe(0);
    expect(ev.status).toBe('not_started');
  });

  it('counts days since the most recent practice, not the first', () => {
    const rows: EvidenceRow[] = [
      { topic: 'Averages', section: 'QA', difficulty: 'easy', attempted: 5, correct: 4, loggedFor: '2026-07-01' },
      { topic: 'Averages', section: 'QA', difficulty: 'easy', attempted: 5, correct: 4, loggedFor: '2026-07-24' },
    ];
    const ev = topicEvidence('Averages', { rows, conceptReported: true, lastMockDaysAgo: null, today });
    expect(ev.daysSincePractice).toBe(2);
  });

  it('always returns exactly six checks, each with an audit trail', () => {
    const ev = topicEvidence('Averages', { rows: [], conceptReported: false, lastMockDaysAgo: null, today });
    expect(ev.checks).toHaveLength(6);
    expect(ev.total).toBe(6);
    for (const c of ev.checks) expect(c.detail.length).toBeGreaterThan(0);
  });
});
