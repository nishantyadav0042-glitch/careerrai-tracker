import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fullyDoneTaskIds, countsAsFullyDone, HALF_TICK_SIGNAL, type CompletionRow } from './completion-portion';

// ── P0-2.3e — THE LAST TWO FINISHED-QUESTION CONSUMERS ──────────────────────
//
// The P0-2 closure audit classified every consumer of a completion row and
// found two still answering "was this FINISHED?" with bare task-id membership
// — the same defect class P0-2.3d fixed for `yesterday`, in files it did not
// touch.
//
//   1. TodaysRoutineCard  `doneCount` renders "N of M done" and fills a
//      progress dot from `completedIds.has(t.id)`. A half-ticked task was
//      counted as done ON THE SAME CARD that labels it "Halfway" with an amber
//      half-circle. The contradiction is the proof.
//
//   2. routine-plan       `done: completedIds.has(...)` feeds doneCount,
//      allDone and nextTask, which the study-companion cron turns into pushes.
//      A half-done task read as finished, so the 20:30 push overstated "N of M
//      done" and — worse — `nextTask` skipped it, meaning the one task most
//      deserving of a nudge could never be named again.
//
// Both now route through the completion authority. Nothing else moves: the
// TOUCHED questions in the same two files stay membership-based, because a
// half-tick genuinely touched the topic.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const code = (p: string) => read(p).split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

const T = (task_id: string, confidence: string | null): CompletionRow => ({ task_id, confidence });

describe('the authority still answers the finished-question', () => {
  it('FULL is finished, PARTIAL is not, legacy null is FULL', () => {
    expect(countsAsFullyDone('green')).toBe(true);
    expect(countsAsFullyDone(HALF_TICK_SIGNAL)).toBe(false);
    expect(countsAsFullyDone(null)).toBe(true);
  });

  it('a mixed day yields only the full tasks', () => {
    const ids = fullyDoneTaskIds([T('a', 'green'), T('b', HALF_TICK_SIGNAL), T('c', null), T('d', 'yellow')]);
    expect([...ids].sort()).toEqual(['a', 'c', 'd']);
  });
});

describe('BLOCKER 1 — the card counts only finished tasks', () => {
  const src = code('src/components/DailyTracker/TodaysRoutineCard.tsx');

  it('doneCount excludes a PARTIAL', () => {
    expect(src, 'the bare-membership count must be gone')
      .not.toMatch(/const doneCount = routine\.tasks\.filter\(\(t\) => completedIds\.has\(t\.id\)\)\.length/);
    // It derives from a single finished-predicate, and that predicate consults
    // the canonical portion the server sent — never completedIds alone.
    expect(src).toMatch(/const doneCount = routine\.tasks\.filter\(\(t\) => isFinished\(t\.id\)\)\.length/);
    const pred = src.slice(src.indexOf('const isFinished'), src.indexOf('const isFinished') + 160);
    expect(pred, 'the predicate must consult the canonical portion').toContain('partialIds');
  });

  it('the progress dot does not fill for a PARTIAL', () => {
    // A filled dot beside a count that excludes it would be the same
    // contradiction one row lower.
    const dot = src.slice(src.indexOf("'h-1.5 w-1.5 rounded-full'"), src.indexOf("'h-1.5 w-1.5 rounded-full'") + 220);
    expect(dot).toContain('partialIds');
  });

  it('"Plan updated · N topics" stays portion-blind — it is a TOUCHED question', () => {
    // A half-tick really did update the plan: coverage advanced. Unchanged.
    expect(src).toMatch(/const completedWithTopic = routine\.tasks\.filter\(\(t\) => completedIds\.has\(t\.id\) && t\.topic\)/);
  });

  it('the per-task done flag and the untick path are untouched', () => {
    expect(src).toMatch(/const done = completedIds\.has\(task\.id\);/);
    expect(src).toMatch(/if \(done && !partial\) \{ void toggleTask\(task\); return; \}/);
  });
});

describe('BLOCKER 2 — the planner treats a PARTIAL as unfinished', () => {
  const src = code('src/lib/routine-plan.ts');

  it('reads the column it needs to decide', () => {
    const sel = src.slice(src.indexOf("from('routine_task_completions').select"), src.indexOf("from('routine_task_completions').select") + 160);
    expect(sel).toContain('confidence');
  });

  it('the per-task done flag routes through the authority', () => {
    expect(src, 'bare membership must be gone')
      .not.toMatch(/done: completedIds\.has\(String\(t\.id\)\)/);
    expect(src).toContain('countsAsFullyDone');
  });

  it('doneCount, allDone and nextTask all derive from that flag', () => {
    // One flag, three readings — they cannot disagree about a task.
    expect(src).toMatch(/const doneCount = tasks\.filter\(\(t\) => t\.done\)\.length/);
    expect(src).toMatch(/allDone: doneCount >= tasks\.length/);
    expect(src).toMatch(/find\(\(t\) => !t\.done\)/);
  });

  it('planStaleReason keeps counting TOUCHED ticks, not finished ones', () => {
    // "Has the student started on this plan?" — a half-tick answers yes.
    expect(src).toMatch(/completionCount: completedIds\.size/);
  });

  it('plannerRecency is untouched — recency is a TOUCHED question', () => {
    expect(src).toContain('plannerRecency(pastRoutines ?? [], pastCompletions ?? []');
  });
});

describe('no second interpretation was introduced', () => {
  it('neither consumer spells the half signal itself', () => {
    for (const p of ['src/components/DailyTracker/TodaysRoutineCard.tsx', 'src/lib/routine-plan.ts']) {
      expect(code(p), `${p}`).not.toMatch(/confidence\s*===\s*'blue'/);
      expect(code(p), `${p}`).not.toMatch(/===\s*HALF_TICK_SIGNAL/);
    }
  });

  it('the weight stays out of both — this is not a ratio', () => {
    for (const p of ['src/components/DailyTracker/TodaysRoutineCard.tsx', 'src/lib/routine-plan.ts']) {
      expect(code(p), `${p}`).not.toContain('completionWeight');
    }
  });

  it('completion-portion.ts remains the single authority and a leaf', () => {
    expect(read('src/lib/completion-portion.ts')).not.toMatch(/^import /m);
  });
});
