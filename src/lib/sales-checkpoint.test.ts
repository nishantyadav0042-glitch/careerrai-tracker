import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  computeCheckpoint, describeCheckpoint, HIGH_PRIORITY_SLICE,
  type OpportunityRow,
} from './sales-checkpoint';

const row = (over: Partial<OpportunityRow> & { studentId: string }): OpportunityRow => ({
  objective: 'retention', rank: 0, workedAt: null, outcome: null, ...over,
});

const worked = (id: string, rank = 0, objective: OpportunityRow['objective'] = 'retention') =>
  row({ studentId: id, rank, objective, workedAt: '2026-08-29T10:00:00Z', outcome: 'interested' });

describe('computeCheckpoint', () => {
  it('counts what was given, what was worked and what is left', () => {
    const c = computeCheckpoint([
      worked('a', 0), worked('b', 1), row({ studentId: 'c', rank: 2 }), row({ studentId: 'd', rank: 3 }),
    ]);
    expect(c.surfaced).toBe(4);
    expect(c.worked).toBe(2);
    expect(c.remaining).toBe(2);
    expect(c.coveragePercent).toBe(50);
  });

  it('keeps the two business goals separately measurable', () => {
    const c = computeCheckpoint([
      worked('a', 0, 'conversion'),
      row({ studentId: 'b', rank: 1, objective: 'conversion' }),
      worked('c', 2, 'retention'), worked('d', 3, 'retention'),
    ]);
    expect(c.conversion).toEqual({ surfaced: 2, worked: 1, reached: 1, remaining: 1 });
    expect(c.retention).toEqual({ surfaced: 2, worked: 2, reached: 2, remaining: 0 });
    // Never summed into one number that could hide either.
    expect(c.retention.surfaced + c.conversion.surfaced).toBe(c.surfaced);
  });

  // The founder's number. Missing seven hot students matters more than
  // completing seventy cold ones, and a completion percentage hides that.
  it('names the unworked high-priority students, not just a count', () => {
    const rows = [
      row({ studentId: 'hot1', rank: 0 }),
      worked('hot2', 1),
      row({ studentId: 'hot3', rank: 2 }),
      ...Array.from({ length: 40 }, (_, i) => worked(`cold${i}`, 10 + i)),
    ];
    const c = computeCheckpoint(rows);
    expect(c.highPriorityRemaining).toBe(2);
    expect(c.highPriorityStudentIds).toEqual(['hot1', 'hot3']);
  });

  it('only the top slice counts as high priority', () => {
    const rows = Array.from({ length: 60 }, (_, i) => row({ studentId: `s${i}`, rank: i }));
    const c = computeCheckpoint(rows);
    expect(c.highPriorityRemaining).toBe(HIGH_PRIORITY_SLICE);
    expect(c.remaining).toBe(60);
  });

  it('ranks the leakage list rather than trusting row order', () => {
    const c = computeCheckpoint([
      row({ studentId: 'third', rank: 9 }),
      row({ studentId: 'first', rank: 1 }),
      row({ studentId: 'second', rank: 4 }),
    ]);
    expect(c.highPriorityStudentIds).toEqual(['first', 'second', 'third']);
  });

  it('breaks rank ties deterministically so the list cannot flicker', () => {
    const a = computeCheckpoint([row({ studentId: 'b', rank: 1 }), row({ studentId: 'a', rank: 1 })]);
    const b = computeCheckpoint([row({ studentId: 'a', rank: 1 }), row({ studentId: 'b', rank: 1 })]);
    expect(a.highPriorityStudentIds).toEqual(b.highPriorityStudentIds);
  });

  // L1: a day with no opportunities is not a perfectly covered day.
  it('an empty day has NO coverage percentage, not 100%', () => {
    const c = computeCheckpoint([]);
    expect(c.coveragePercent).toBeNull();
    expect(c.surfaced).toBe(0);
    expect(c.highPriorityStudentIds).toEqual([]);
  });

  it('a fully worked day is 100%', () => {
    expect(computeCheckpoint([worked('a'), worked('b')]).coveragePercent).toBe(100);
  });

  // The rule that stops the counter becoming a thing to game.
  it('a row with no disposition is never counted as worked', () => {
    const c = computeCheckpoint([row({ studentId: 'a', rank: 0 })]);
    expect(c.worked).toBe(0);
    expect(c.remaining).toBe(1);
  });
});

describe('describeCheckpoint', () => {
  it('states what is left, and calls out the top-priority remainder', () => {
    const s = describeCheckpoint(computeCheckpoint([
      row({ studentId: 'hot', rank: 0 }), worked('a', 1), worked('b', 2),
    ]));
    expect(s).toContain('2 of 3 worked');
    expect(s).toContain('1 left');
    expect(s).toContain('1 of those are top priority');
  });

  it('says so plainly when the day is done', () => {
    expect(describeCheckpoint(computeCheckpoint([worked('a')]))).toContain('Nothing left today');
  });

  it('a quiet day reads as quiet, never as failure', () => {
    expect(describeCheckpoint(computeCheckpoint([]))).toBe('Nothing needs attention right now.');
  });
});

// ── Guards ──────────────────────────────────────────────────────────────────

const read = (f: string) => fs.readFileSync(f, 'utf-8');

describe('the checkpoint cannot become a performance score', () => {
  it('worked_at is set only by a recorded disposition, never by a tap', () => {
    const mig = read('supabase/migrations/20260829d_daily_opportunity.sql');
    expect(mig).toMatch(/worked_at\s+timestamptz/);
    // An outcome without a time (or vice versa) is a half-written record that
    // would corrupt every coverage number derived from it.
    expect(mig).toMatch(/check \(\(worked_at is null\) = \(outcome is null\)\)/);
  });

  it('the same student cannot be surfaced twice to one rep in one day', () => {
    const mig = read('supabase/migrations/20260829d_daily_opportunity.sql');
    expect(mig, 'this must be a database fact, not a frontend hope')
      .toMatch(/unique \(rep_id, student_id, ist_day\)/);
  });

  it('no telemetry field reaches the payslip', () => {
    const pay = read('src/lib/sales-earnings.ts');
    for (const banned of ['sales_opportunity', 'worked_at', 'surfaced', 'profile_opens', 'call_count']) {
      expect(pay, `${banned} must never be an input to pay`).not.toContain(banned);
    }
  });
});

// ── Worked is not reached ───────────────────────────────────────────────────
//
// Founder, 29 Aug 2026, listing the ways this experiment could produce a false
// positive: "the founder sees 500 'worked' and assumes 500 meaningful
// conversations." `worked` is set by ANY disposition, and `no_answer` is a
// disposition, so that reading is available on day one unless the two numbers
// are reported together.

const dialled = (id: string, rank = 0, objective: OpportunityRow['objective'] = 'retention') =>
  row({ studentId: id, rank, objective, workedAt: '2026-08-29T10:00:00Z', outcome: 'no_answer' });

describe('a dial nobody answered is worked, but not reached', () => {
  it('a full day of unanswered dials is 100% coverage and ZERO conversations', () => {
    const c = computeCheckpoint([dialled('a', 0), dialled('b', 1), dialled('c', 2)]);
    expect(c.worked).toBe(3);
    expect(c.coveragePercent, 'the students WERE actioned — coverage is honest').toBe(100);
    expect(c.reached, 'but nobody was spoken to, and that must be visible').toBe(0);
  });

  it('separates the two on a mixed day', () => {
    const c = computeCheckpoint([
      worked('spoke1', 0), dialled('missed1', 1), worked('spoke2', 2), row({ studentId: 'todo', rank: 3 }),
    ]);
    expect(c.surfaced).toBe(4);
    expect(c.worked).toBe(3);
    expect(c.reached).toBe(2);
    expect(c.remaining).toBe(1);
  });

  it('reached is never greater than worked, on any mix', () => {
    const c = computeCheckpoint([
      worked('a', 0), dialled('b', 1), worked('c', 2), dialled('d', 3), row({ studentId: 'e', rank: 4 }),
    ]);
    expect(c.reached).toBeLessThanOrEqual(c.worked);
    expect(c.worked).toBeLessThanOrEqual(c.surfaced);
  });

  it('splits reached by objective too, so neither goal can hide behind the other', () => {
    const c = computeCheckpoint([
      worked('r1', 0, 'retention'), dialled('r2', 1, 'retention'),
      dialled('c1', 2, 'conversion'), dialled('c2', 3, 'conversion'),
    ]);
    expect(c.retention.reached).toBe(1);
    expect(c.conversion.reached, 'a whole objective can be worked and never reached').toBe(0);
    expect(c.conversion.worked).toBe(2);
  });

  // The vocabulary is owned by sales-disposition, not re-decided here.
  it('every connected outcome counts as reached', () => {
    for (const o of ['interested', 'callback', 'converted', 'not_interested', 'dnd']) {
      const c = computeCheckpoint([row({ studentId: 'x', rank: 0, workedAt: '2026-08-29T10:00:00Z', outcome: o })]);
      expect(c.reached, `${o} means a human answered`).toBe(1);
    }
  });

  it('an unworked row is neither worked nor reached', () => {
    const c = computeCheckpoint([row({ studentId: 'a', rank: 0 })]);
    expect(c.worked).toBe(0);
    expect(c.reached).toBe(0);
  });
});
