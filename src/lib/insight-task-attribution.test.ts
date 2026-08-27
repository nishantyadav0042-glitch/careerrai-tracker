import { describe, it, expect } from 'vitest';
import { computeWeeklyInsight, lastCompleteWeek } from './weekly-insight';
import { computeDailyInsight, insightKey, recordInsightShown, loadSuppressedInsightKeys } from './daily-insight';

// ── A task id means nothing without its day ────────────────────────────────
//
// The planner reuses task ids across days. In ONE production week (17–23 Aug)
// 362 ids repeated and 314 of them carried a DIFFERENT TOPIC on different
// days. Both insight engines built their task→topic map keyed by id alone, so
// the map was last-write-wins and 135 of 190 completions — 71% — resolved to a
// topic the student had not worked on.
//
// Two things were wrong downstream, and the second is worse than the first:
//
//   1. the sentence named the wrong topic ("Algebra: struggled → solid" for a
//      topic they never opened)
//   2. the suppression key is `kind:subject`, so a WRONG subject silenced the
//      wrong insight for seven days — the student stopped hearing about a real
//      gap because we had recorded a fictional one
//
// Section attribution happened to be safe (0 ids conflicted on section), which
// is exactly why this survived: every section-level number looked right.

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const q: Record<string, unknown> = {
        select: () => q, eq: () => q, gte: () => q, lt: () => q,
        then: (r: (v: unknown) => unknown) =>
          Promise.resolve({ data: tables[table] ?? [], error: null }).then(r),
      };
      return q;
    },
  };
}

const NOW = new Date('2026-08-27T09:00:00Z');
const WIN = lastCompleteWeek(NOW);
const day = (n: number) => {
  const d = new Date(`${WIN.start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * The real shape: id 't1' is Algebra on Monday and Geometry on Tuesday. The
 * student completed it BOTH days, so a correct engine sees two topics.
 */
const REUSED_ID = {
  daily_reports: [0, 1, 2].map((n) => ({ report_date: day(n) })),
  daily_routines: [
    { routine_date: day(0), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
    { routine_date: day(1), tasks: [{ id: 't1', section: 'QA', topic: 'Geometry' }] },
    { routine_date: day(2), tasks: [{ id: 't1', section: 'QA', topic: 'Arithmetic' }] },
  ],
  routine_task_completions: [
    { routine_date: day(0), task_id: 't1', confidence: 'green', completed_at: `${day(0)}T04:00:00Z` },
    { routine_date: day(1), task_id: 't1', confidence: 'green', completed_at: `${day(1)}T04:00:00Z` },
    { routine_date: day(2), task_id: 't1', confidence: 'green', completed_at: `${day(2)}T04:00:00Z` },
  ],
  video_sessions: [],
} as Record<string, Row[]>;

describe('topic attribution survives reused task ids', () => {
  it('the weekly review counts every DAY\'s topic, not just the last one written', async () => {
    const out = await computeWeeklyInsight(fakeAdmin(REUSED_ID), 'stu-1', NOW);
    if (out.status !== 'ready') throw new Error('fixture must reach ready');
    const move = out.sections.find((s) => s.id === 'topic_movement');
    expect(
      move,
      'Keyed by task id alone, all three completions collapse onto whichever routine was read last — one topic, so the section never fires.',
    ).toBeTruthy();
    expect(move!.text).toMatch(/3 topics/);
    for (const t of ['Algebra', 'Geometry', 'Arithmetic']) expect(move!.text).toContain(t);
  });

  it('the daily RECOVERY insight names the topic that was actually red, then green', async () => {
    // Same id, red on Monday as Algebra, green on Wednesday as Algebra again —
    // with a DIFFERENT topic sitting on that id on Tuesday. Keyed by id alone,
    // Tuesday's topic overwrites both and the praise names the wrong thing.
    const today = new Date();
    const d = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    const tables = {
      daily_reports: [{ report_date: d(2) }, { report_date: d(1) }, { report_date: d(0) }],
      // ORDER MATTERS, and the first version of this test got it wrong: with
      // the conflicting row in the middle, last-write-wins happened to land on
      // the right topic and the test passed even with the fix reverted. The
      // conflicting day is LAST here, so id-only keying resolves both marks to
      // Geometry — a topic the student never marked at all.
      daily_routines: [
        { routine_date: d(2), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
        { routine_date: d(0), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
        { routine_date: d(1), tasks: [{ id: 't1', section: 'QA', topic: 'Geometry' }] },
      ],
      routine_task_completions: [
        { routine_date: d(2), task_id: 't1', confidence: 'red' },
        { routine_date: d(0), task_id: 't1', confidence: 'green' },
      ],
    } as Record<string, Row[]>;
    const insight = await computeDailyInsight(
      fakeAdmin(tables),
      'stu-1',
      { isRepeater: false, isWorkingProfessional: false },
      { topicMemory: [] },
    );
    void today;
    expect(insight?.kind).toBe('recovery');
    expect(
      insight?.subject,
      'The recovery praise resolved to the topic that happened to be written last on this id. The suppression key is kind:subject, so this also silences the wrong insight for seven days.',
    ).toBe('Algebra');
  });
});

// ── The rest of the matrix (Section F) ─────────────────────────────────────

const d = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const archetype = { isRepeater: false, isWorkingProfessional: false };
const daily = (tables: Record<string, Row[]>) =>
  computeDailyInsight(fakeAdmin(tables) as never, 'stu-1', archetype, { topicMemory: [] });

/** red on the older day, green on the newer — the RECOVERY shape. */
function recoveryTables(routines: Row[]): Record<string, Row[]> {
  return {
    daily_reports: [{ report_date: d(2) }, { report_date: d(1) }, { report_date: d(0) }],
    daily_routines: routines,
    routine_task_completions: [
      { routine_date: d(2), task_id: 't1', confidence: 'red' },
      { routine_date: d(0), task_id: 't1', confidence: 'green' },
    ],
  };
}

describe('the attribution matrix', () => {
  it('same id, SAME topic, different days — still one topic, still correct', async () => {
    const insight = await daily(recoveryTables([
      { routine_date: d(2), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
      { routine_date: d(1), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
      { routine_date: d(0), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
    ]));
    expect(insight?.subject).toBe('Algebra');
  });

  it('same id, DIFFERENT topics, and the conflicting day is never the one marked', async () => {
    const insight = await daily(recoveryTables([
      { routine_date: d(2), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
      { routine_date: d(0), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
      { routine_date: d(1), tasks: [{ id: 't1', section: 'QA', topic: 'Geometry' }] },
    ]));
    expect(insight?.subject).toBe('Algebra');
  });

  it('REORDERED rows change nothing — the key is the pair, not arrival order', async () => {
    // The whole bug was an ordering dependency: whichever routine was read
    // last won. Two different orders must now give the same answer.
    const rows = [
      { routine_date: d(1), tasks: [{ id: 't1', section: 'QA', topic: 'Geometry' }] },
      { routine_date: d(2), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
      { routine_date: d(0), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
    ];
    const a = await daily(recoveryTables(rows));
    const b = await daily(recoveryTables([...rows].reverse()));
    expect(a?.subject).toBe('Algebra');
    expect(b?.subject).toBe(a?.subject);
  });

  it('MISSING topic metadata is skipped, never guessed from a neighbouring day', async () => {
    const insight = await daily(recoveryTables([
      { routine_date: d(2), tasks: [{ id: 't1', section: 'QA', topic: null }] },
      { routine_date: d(0), tasks: [{ id: 't1', section: 'QA', topic: null }] },
      { routine_date: d(1), tasks: [{ id: 't1', section: 'QA', topic: 'Geometry' }] },
    ]));
    // No topic on either marked day, so RECOVERY cannot fire for a topic.
    expect(insight?.kind).not.toBe('recovery');
  });

  it('a completion with NO matching routine row attributes nothing', async () => {
    // Historical data: the completion survives, the plan that served it does
    // not. Inventing a topic for it would be worse than saying nothing.
    const insight = await daily({
      daily_reports: [{ report_date: d(2) }, { report_date: d(0) }],
      daily_routines: [{ routine_date: d(0), tasks: [{ id: 't9', section: 'QA', topic: 'Algebra' }] }],
      routine_task_completions: [
        { routine_date: d(2), task_id: 't1', confidence: 'red' },
        { routine_date: d(0), task_id: 't1', confidence: 'green' },
      ],
    });
    expect(insight?.kind).not.toBe('recovery');
  });

  it('MULTIPLE completions of the same id across days each keep their own topic', async () => {
    const tables = {
      daily_reports: [{ report_date: d(2) }, { report_date: d(1) }, { report_date: d(0) }],
      daily_routines: [
        { routine_date: d(2), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
        { routine_date: d(1), tasks: [{ id: 't1', section: 'QA', topic: 'Geometry' }] },
        { routine_date: d(0), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
      ],
      routine_task_completions: [
        { routine_date: d(2), task_id: 't1', confidence: 'red' },
        { routine_date: d(1), task_id: 't1', confidence: 'red' },
        { routine_date: d(0), task_id: 't1', confidence: 'green' },
      ],
    } as Record<string, Row[]>;
    // Algebra went red then green. Geometry only ever went red — it must NOT
    // be the one praised.
    const insight = await daily(tables);
    expect(insight?.kind).toBe('recovery');
    expect(insight?.subject).toBe('Algebra');
  });
});

describe('a wrong topic cannot silence the right one for seven days', () => {
  it('the suppression key records the topic that was actually shown', async () => {
    const insight = await daily(recoveryTables([
      { routine_date: d(2), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
      { routine_date: d(0), tasks: [{ id: 't1', section: 'QA', topic: 'Algebra' }] },
      { routine_date: d(1), tasks: [{ id: 't1', section: 'QA', topic: 'Geometry' }] },
    ]));
    const written: Row[] = [];
    const admin = { from: () => ({ upsert: async (r: Row) => { written.push(r); return { error: null }; } }) };
    await recordInsightShown(admin as never, 'stu-1', insight!);
    expect(written[0].insight_key).toBe('recovery:Algebra');
    expect(
      written[0].insight_key,
      'Recording recovery:Geometry would keep the REAL Algebra insight quiet for a week while praising a topic the student never opened. The wrong subject does not just misinform — it silences.',
    ).not.toBe('recovery:Geometry');
  });

  it('the key that gets written is the key the suppressor reads', async () => {
    // Two halves of the same identity. If they ever disagree, suppression
    // stops working silently and the card repeats — incident #37 again.
    const i = { kind: 'recovery' as const, title: 't', text: 'x', subject: 'Algebra' };
    const written: Row[] = [];
    const admin = { from: () => ({ upsert: async (r: Row) => { written.push(r); return { error: null }; } }) };
    await recordInsightShown(admin as never, 'stu-1', i);
    const filters: Array<{ op: string; col: string; val: unknown }> = [];
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push({ op: 'eq', col: c, val: v }); return q; },
      gt: () => q, lt: () => q,
      then: (r: (v: unknown) => unknown) =>
        Promise.resolve({ data: [{ insight_key: written[0].insight_key, last_shown_on: d(1) }], error: null }).then(r),
    };
    const suppressed = await loadSuppressedInsightKeys({ from: () => q } as never, 'stu-1');
    expect(suppressed.has(insightKey(i))).toBe(true);
  });
});
