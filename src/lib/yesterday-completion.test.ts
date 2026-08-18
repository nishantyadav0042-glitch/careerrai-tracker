import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fullyDoneTaskIds, HALF_TICK_SIGNAL, type CompletionRow } from './completion-portion';

// ── P0-2.3d — YESTERDAY ASKS THE FINISHED-QUESTION ──────────────────────────
//
// The P0-2 closure audit found the one remaining contract violation. In
// `routine/today`'s buildHistory, two derivations answered "was this finished?"
// with task-id MEMBERSHIP:
//
//   yesterday.done             = completedByDate.get(date).size
//   yesterdayUnfinishedTopics  = tasks.filter((t) => !yesterdayDoneIds.has(t.id))
//
// Both count a PARTIAL as finished. Two consequences, both real once a student
// uses the half-tick:
//
//   1. TodaysRoutineCard renders "⚡ Yesterday: all 4 done — today's plan
//      builds on it." for a day of four half-ticks. A false claim, to the
//      student, about their own work.
//
//   2. plan-reason carries an unfinished topic into today's because-line. A
//      half-ticked topic is excluded from `yesterdayUnfinishedTopics`, so the
//      topic that most deserves to come back tomorrow is the one silently
//      dropped.
//
// The rest of buildHistory legitimately asks "was this TOUCHED?" — per-section
// recency, timesPracticed, plannerRecency — and keeps using membership. Only
// these two derivations change.

const T = (task_id: string, confidence: string | null): CompletionRow => ({ task_id, confidence });

describe('which completions count as finished', () => {
  it('all FULL — every task counts', () => {
    const ids = fullyDoneTaskIds([T('a', 'green'), T('b', 'green'), T('c', 'green')]);
    expect(ids.size).toBe(3);
    expect(ids.has('a')).toBe(true);
  });

  it('a PARTIAL does not count as finished', () => {
    const ids = fullyDoneTaskIds([T('a', HALF_TICK_SIGNAL)]);
    expect(ids.size).toBe(0);
    expect(ids.has('a')).toBe(false);
  });

  it('a legacy null-confidence completion still counts as FULL', () => {
    // The documented historical rule, unchanged: no partiality was ever
    // expressed, by a control that had only one option.
    const ids = fullyDoneTaskIds([T('a', null)]);
    expect(ids.has('a')).toBe(true);
  });

  it('struggle signals still count as finished — a hard task, not a half one', () => {
    const ids = fullyDoneTaskIds([T('a', 'yellow'), T('b', 'red')]);
    expect(ids.size).toBe(2);
  });

  it('a mixed day counts only the full ones', () => {
    // 4 planned: 2 full, 1 half, 1 legacy null, 1 untouched.
    const ids = fullyDoneTaskIds([T('a', 'green'), T('b', 'green'), T('c', HALF_TICK_SIGNAL), T('d', null)]);
    expect([...ids].sort()).toEqual(['a', 'b', 'd']);
    expect(ids.has('c'), 'the half-ticked task is not finished').toBe(false);
  });

  it('an untouched task is simply absent', () => {
    expect(fullyDoneTaskIds([T('a', 'green')]).has('z')).toBe(false);
  });

  it('returns an empty set for no completions, never null', () => {
    expect(fullyDoneTaskIds([]).size).toBe(0);
  });
});

describe('the yesterday derivations route through the authority', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/api/routine/today/route.ts'), 'utf8');
  const code = src.split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

  it('the done COUNT is not a membership size', () => {
    expect(code, 'yesterday.done must not count rows')
      .not.toMatch(/done: \(completedByDate\.get\(lastPastDay\.routine_date\) \?\? new Set\(\)\)\.size/);
    expect(code).toContain('fullyDoneTaskIds');
  });

  it('the unfinished-topic filter is not a membership test', () => {
    const block = code.slice(code.indexOf('yesterdayUnfinishedTopics'), code.indexOf('yesterdayUnfinishedTopics') + 600);
    expect(block, 'the filter must consult the fully-done set')
      .not.toMatch(/!yesterdayDoneIds\.has\(t\.id\)/);
  });

  it('both derivations read the SAME fully-done set', () => {
    // One set computed once and shared, not two derivations that could
    // disagree about the same task on the same day.
    expect((code.match(/yesterdayFullyDone/g) ?? []).length,
      'the count and the unfinished filter must both use the one set').toBeGreaterThanOrEqual(3);
    expect(code).toContain('fullyDoneByDate');
  });

  it('the TOUCHED questions still use membership, untouched by this gate', () => {
    // Per-section recency and timesPracticed ask "was this practised at all?",
    // which a half-tick answers yes. They must keep completedByDate.
    expect(code).toContain('completedByDate');
    expect(code).toMatch(/completedTaskIds\.has\(t\.id\)/);
  });

  it('adds no second completion definition', () => {
    expect(code).not.toMatch(/===\s*'blue'/);
    expect(code).not.toContain('countsAsFullyDone(c.confidence) ? 1 : 0');
  });

  it('leaves the plan-completion ratio on its own authority', () => {
    expect(code, 'the weighted ratio is a different question').toContain('completionWeight');
    expect(code).toContain('weightByDate');
  });
});
