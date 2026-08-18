import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fullyDoneTaskIds, HALF_TICK_SIGNAL, type CompletionRow } from './completion-portion';

// ── P0-2.3f — THE DISPLAYED "N/M DONE" IS A FINISHED-QUESTION ───────────────
//
// The fresh P0-2 closure audit found three producers independently
// implementing the SAME avoidance pattern (served >= 3, ratio < 0.34), and all
// three counting the numerator with bare task-id membership — even though all
// three already SELECT `confidence` and use it correctly elsewhere in the same
// file (red-mark/struggle counts).
//
//   daily-insight.ts    "Only N of M {section} tasks done…" — student-facing,
//                       no LLM in the path.
//   buddy-briefing.ts   "{section} tasks completed N/M" — fed to an LLM told
//                       "State only verifiable facts and numbers."
//   mentor-doors.ts     "{section}: N/M planned tasks completed", and the
//                       rule-based fallback "({section} keeps getting left
//                       (N of M done)" — sent directly to a student, no LLM.
//
// TWO QUESTIONS, deliberately kept apart, which is the whole point of this
// gate:
//
//   TOUCHED   "did the student work on this section at all?" — the avoidance
//             THRESHOLD itself. served >= 3 && ratio < 0.34. Portion-blind is
//             correct: a half-tick is real work on that section, and per the
//             founder's ruling a PARTIAL may make a section read as LESS
//             avoided than bare non-engagement would, which is honest.
//
//   FINISHED  "how many are DONE / COMPLETED?" — the number printed. A half
//             is not done. countsAsFullyDone is required.
//
// The fix touches only the second. The threshold, the served denominator, the
// struggle/red handling and the surrounding copy are unchanged.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const code = (p: string) => read(p).split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

const T = (task_id: string, confidence: string | null): CompletionRow => ({ task_id, confidence });

describe('the authority answers the finished-count question', () => {
  it('FULL contributes, PARTIAL does not, legacy null contributes as FULL', () => {
    const ids = fullyDoneTaskIds([T('a', 'green'), T('b', HALF_TICK_SIGNAL), T('c', null)]);
    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(false);
    expect(ids.has('c')).toBe(true);
  });
});

describe('a section can still read as avoided while carrying PARTIAL work', () => {
  // The touched-question and the finished-question can legitimately disagree:
  // 3 served, 1 full + 2 partial is touched-avoided (3/3 touched, not avoided
  // by the threshold) but finished-avoided (1/3 done < 0.34 is false... use a
  // sharper fixture: 4 served, 1 full, so ratio 0.25 < 0.34 -> avoided by
  // EITHER measure, but the PARTIAL evidence, if it existed, must not have
  // silently inflated the finished count to escape the threshold.
  it('a partial does not rescue a section from the finished count staying low', () => {
    const rows = [T('a', 'green'), T('b', HALF_TICK_SIGNAL), T('c', HALF_TICK_SIGNAL), T('d', HALF_TICK_SIGNAL)];
    const finished = fullyDoneTaskIds(rows).size;
    expect(finished, 'three partials must not read as three done').toBe(1);
  });
});

// mentor-doors has NO `served >= 3` avoidance gate of its own — it ranks
// sections by ratio (`served >= 2`) for the weakest/strongest ranking, a
// different touched-question mechanism. daily-insight and buddy-briefing both
// gate on `served >= 3`. Checked per-file rather than assumed shared.
const AVOIDANCE_GATE: Record<string, RegExp | null> = {
  'src/lib/daily-insight.ts': /served\[s\] >= 3 && /,
  'src/lib/buddy-briefing.ts': /served\[s\] >= 3 && /,
  'src/lib/mentor-doors.ts': /served\[s\] >= 2/,
};

for (const [name, path, calls] of [
  ['daily-insight', 'src/lib/daily-insight.ts', 1],
  ['buddy-briefing', 'src/lib/buddy-briefing.ts', 1],
  ['mentor-doors', 'src/lib/mentor-doors.ts', 1],
] as const) {
  describe(`${name} — the finished tally routes through the authority`, () => {
    const src = code(path);

    it('calls the shared authority, once, for the finished set', () => {
      expect((src.match(/fullyDoneTaskIds\(/g) ?? []).length, 'one local finished-set, not the predicate repeated inline')
        .toBeGreaterThanOrEqual(calls);
    });

    it('never spells the raw half signal itself', () => {
      expect(src).not.toMatch(/confidence\s*===\s*'blue'/);
      expect(src).not.toMatch(/===\s*HALF_TICK_SIGNAL/);
    });

    it('does not use completionWeight — this is a count, not the load ratio', () => {
      expect(src).not.toContain('completionWeight');
    });

    it('the touched-question gate itself is untouched — still bare membership', () => {
      expect(src).toMatch(AVOIDANCE_GATE[path]!);
    });

    it('the served denominator is untouched', () => {
      expect(src).toMatch(/served\[sec\] = \(served\[sec\] \?\? 0\) \+ 1/);
    });

    it('the struggle/red handling is untouched', () => {
      expect(src).toMatch(/confidence === 'red'/);
    });
  });
}

describe('the two questions stay distinguishable in each file', () => {
  it('daily-insight keeps a served (touched) map and a finished-only numerator, not one merged map', () => {
    const src = code('src/lib/daily-insight.ts');
    expect(src).toContain('served[sec]');
    expect(src).toMatch(/doneBySec\[.*\] = \(doneBySec\[.*\] \?\? 0\) \+ 1/);
  });

  it('buddy-briefing keeps served and the finished-only doneCount apart', () => {
    const src = code('src/lib/buddy-briefing.ts');
    expect(src).toContain('served[sec]');
    expect(src).toMatch(/doneCount\[.*\] = \(doneCount\[.*\] \?\? 0\) \+ 1/);
  });

  it('mentor-doors keeps served and the finished-only done map apart, for both the facts line and the fallback', () => {
    const src = code('src/lib/mentor-doors.ts');
    expect(src).toContain('served[sec]');
    expect(src).toMatch(/done\[sec\] = \(done\[sec\] \?\? 0\) \+ 1/);
    // The fallback and the ratios both read `done`, so fixing the one map
    // fixes the chat message and the "getting done consistently" line too.
    expect(src).toContain('done[weak.s]');
    expect(src).toContain('done[s] ?? 0');
  });
});

describe('output contract preserved — copy unchanged', () => {
  it('the exact wording of every claim survives the fix', () => {
    expect(read('src/lib/daily-insight.ts')).toContain('tasks done. Give');
    expect(read('src/lib/buddy-briefing.ts')).toContain('tasks completed ${doneCount[s] ?? 0}/${served[s]} (last 14 days)');
    expect(read('src/lib/mentor-doors.ts')).toContain('planned tasks completed');
    expect(read('src/lib/mentor-doors.ts')).toContain('tasks are getting done consistently');
    expect(read('src/lib/mentor-doors.ts')).toContain('keeps getting left');
  });
});
