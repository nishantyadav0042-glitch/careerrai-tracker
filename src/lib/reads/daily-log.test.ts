import { describe, it, expect } from 'vitest';
import {
  readDailyLogWindow, loggedDaysOrUnknown, loggedTodayOrUnknown, windowRowsOrUnknown,
} from './daily-log';

// The founder's Wave 1 requirement, in his words: "prove UNAVAILABLE cannot
// become a value or trigger a mutation."
//
// The failure being tested against is not hypothetical. weekly-plan-reconcile
// read 656 students in one request, PostgREST returned `data: null` with NO
// error, the caller read that as "no rows", and 56 students were told they had
// studied zero hours in a week they had studied 282 of. Their syllabus finish
// dates moved 282 days.
//
// So: every failure shape gets its own case, the producer must not be reached
// on any of them, and `null` must be the only thing a renderer can get out.

/** A minimal query-builder stub. Records whether the query was even built. */
function stubClient(result: { data: unknown; error: unknown } | (() => never)) {
  const calls: { table: string; filters: Record<string, unknown> }[] = [];
  const builder = (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain = {
      select: () => chain,
      eq: (k: string, v: unknown) => { filters[`eq:${k}`] = v; return chain; },
      gte: (k: string, v: unknown) => { filters[`gte:${k}`] = v; return chain; },
      lte: (k: string, v: unknown) => { filters[`lte:${k}`] = v; return chain; },
      order: () => {
        calls.push({ table, filters });
        if (typeof result === 'function') return result();
        return Promise.resolve(result);
      },
    };
    return chain;
  };
  return { from: builder, calls };
}

const TODAY = '2026-08-23';
const row = (d: string) => ({
  report_date: d, study_duration: 2, study_duration_source: 'credited',
  topics_covered: null, mock_score: null, mock_taken: false,
});

describe('the reader queries exactly the seven-day window', () => {
  it('filters gte(today−6) and lte(today) — not gte(today−7)', async () => {
    const c = stubClient({ data: [], error: null });
    await readDailyLogWindow(c, 'student-1', TODAY);
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0].table).toBe('daily_reports');
    expect(c.calls[0].filters['gte:report_date']).toBe('2026-08-17');
    expect(c.calls[0].filters['lte:report_date']).toBe('2026-08-23');
    // The `lte` is not decoration: without it a backdated future row would
    // land outside the window and the producer would refuse the whole read.
  });

  it('scopes to the student', async () => {
    const c = stubClient({ data: [], error: null });
    await readDailyLogWindow(c, 'student-1', TODAY);
    expect(c.calls[0].filters['eq:student_id']).toBe('student-1');
  });
});

describe('UNAVAILABLE never becomes a value', () => {
  const failures: [string, { data: unknown; error: unknown } | (() => never)][] = [
    ['an explicit PostgREST error', { data: null, error: { message: 'statement timeout' } }],
    ['data: null with NO error — the weekly-plan-reconcile shape', { data: null, error: null }],
    ['data: undefined', { data: undefined, error: null }],
    ['a thrown exception', () => { throw new Error('socket hang up'); }],
  ];

  for (const [name, result] of failures) {
    it(`${name} → unavailable, and no number reaches a renderer`, async () => {
      const c = stubClient(result);
      const s = await readDailyLogWindow(c, 'student-1', TODAY);

      expect(s.state).toBe('unavailable');
      // The three renderer accessors are the ONLY way out of this module.
      expect(loggedDaysOrUnknown(s)).toBeNull();
      expect(loggedTodayOrUnknown(s)).toBeNull();
      expect(windowRowsOrUnknown(s)).toBeNull();
      // Specifically not the plausible wrong answers.
      expect(loggedDaysOrUnknown(s)).not.toBe(0);
      expect(loggedTodayOrUnknown(s)).not.toBe(false);
    });

    it(`${name} → no FactResult is produced at all`, async () => {
      // The structural guarantee: on a failed read the producers are never
      // called, so there is no code path in which a fact and an unavailable
      // read coexist and someone later picks the wrong one.
      const c = stubClient(result);
      const s = await readDailyLogWindow(c, 'student-1', TODAY);
      expect('value' in s).toBe(false);
    });
  }

  it('a bad day key is unavailable, not a window', async () => {
    const c = stubClient({ data: [], error: null });
    const s = await readDailyLogWindow(c, 'student-1', 'not-a-date');
    expect(s.state).toBe('unavailable');
    // And the query was never issued.
    expect(c.calls).toHaveLength(0);
  });
});

describe('a successful read produces both facts', () => {
  it('an empty result is a KNOWN zero, distinct from unavailable', async () => {
    const c = stubClient({ data: [], error: null });
    const s = await readDailyLogWindow(c, 'student-1', TODAY);
    expect(s.state).toBe('value');
    expect(loggedDaysOrUnknown(s)).toBe(0);
    expect(loggedTodayOrUnknown(s)).toBe(false);
  });

  it('counts real rows and answers today', async () => {
    const c = stubClient({ data: [row('2026-08-19'), row('2026-08-22'), row('2026-08-23')], error: null });
    const s = await readDailyLogWindow(c, 'student-1', TODAY);
    expect(loggedDaysOrUnknown(s)).toBe(3);
    expect(loggedTodayOrUnknown(s)).toBe(true);
  });

  it('an out-of-window row makes the COUNT unknown but not the read', async () => {
    // Only reachable if something else widened the query. The count refuses;
    // the rows still come back, because the caller may legitimately want them.
    const c = stubClient({ data: [row('2026-08-16'), row('2026-08-23')], error: null });
    const s = await readDailyLogWindow(c, 'student-1', TODAY);
    expect(s.state).toBe('value');
    expect(loggedDaysOrUnknown(s)).toBeNull();
    expect(windowRowsOrUnknown(s)).toHaveLength(2);
  });
});

describe('cross-surface equality — the same-moment invariant', () => {
  it('two independent reads of one fixture give one number', async () => {
    // Weekly Diagnosis and the buddy consistency flag now read through this
    // module. Before Wave 1 they held two different windows and could disagree
    // about the same student in the same second.
    const data = [row('2026-08-18'), row('2026-08-20'), row('2026-08-23')];
    const a = await readDailyLogWindow(stubClient({ data, error: null }), 's', TODAY);
    const b = await readDailyLogWindow(stubClient({ data, error: null }), 's', TODAY);
    expect(loggedDaysOrUnknown(a)).toBe(loggedDaysOrUnknown(b));
    expect(loggedDaysOrUnknown(a)).toBe(3);
  });

  it('the count can never exceed 7 — "Studied 8 of 7 days" is unreachable', async () => {
    // Eight consecutive days of rows, as the old queries returned. The window
    // filter drops the eighth; if a caller ever bypassed the filter, the
    // producer refuses rather than printing 8.
    const eight = ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19',
                   '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23'].map(row);
    const s = await readDailyLogWindow(stubClient({ data: eight, error: null }), 's', TODAY);
    const n = loggedDaysOrUnknown(s);
    expect(n === null || n <= 7).toBe(true);
    expect(n).not.toBe(8);
  });
});
