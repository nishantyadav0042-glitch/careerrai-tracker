import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── THE TICK CONVERGES, IT NEVER ERRORS ─────────────────────────────────────
//
// Found by the Insight Engine hostile audit, 18 Aug, and confirmed against
// production: `routine_task_completions` carries
// UNIQUE (student_id, routine_date, task_id), but the route did a
// read-then-write — maybeSingle() for an existing row, then insert() on the
// else-branch. Two taps racing on one task (double-tap, offline retry, two
// tabs) BOTH read null and BOTH insert; the loser took a unique violation and
// the route answered HTTP 500 "Could not save that tick" — for a student whose
// tick had in fact been recorded perfectly by the winner.
//
// This matters far beyond one error toast. The tick is the canonical event the
// whole memory architecture is meant to read. An event source that can answer
// "500" to a successful action, or that can write its derived coverage twice
// for one student action, cannot carry the standard the founder set:
// CareerRai must never know less than it recorded, nor claim more than it can
// prove.
//
// THE INVARIANT, in the founder's words (18 Aug):
//   "N simultaneous requests representing the same logical completion converge
//    to one completion state and one canonical event."
//
// A source-reading guard rather than a live-concurrency test, matching the
// house style of planner-unification.test.ts and mock-date-authority.guard —
// the shape of the write path is what has to stay true, and that is checkable
// without a database.

const ROUTE = join(process.cwd(), 'src/app/api/routine/complete-task/route.ts');
const src = readFileSync(ROUTE, 'utf8');

// Comments explain the rule; only executable lines can break it.
const code = src
  .split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');

describe('the tick converges under concurrency', () => {
  it('treats a unique violation (23505) as convergence, not failure', () => {
    expect(code).toContain('23505');
    // The convergence must be bound to a named condition, not swallowed
    // silently — a bare try/catch around the insert would also hide real
    // failures like a broken FK or a bad column.
    expect(code).toMatch(/converged/);
  });

  it('still 500s on any insert error that is NOT a unique violation', () => {
    // The guard is `insErr && !converged` — a genuine write failure must keep
    // its loud path. Losing this is how a tick silently vanishes and a
    // student's streak goes wrong days later (Backbone audit, 13 Aug).
    expect(code).toMatch(/insErr\s*&&\s*!converged/);
    expect(code).toContain("Could not save that tick");
  });

  it('never reports success on a write that did not happen', () => {
    // Both failure paths must remain reachable and explicit.
    expect(code).toContain("Could not un-mark that task");
  });
});

describe('one student action produces at most one derived write', () => {
  it('skips the coverage advance on the converged (losing) request', () => {
    // The winner already applied the confidence signal. Re-applying it would
    // be two derived writes for one canonical event — exactly the duplication
    // the memory architecture forbids, and the reason this is guarded rather
    // than left to the monotonic status merge to absorb.
    expect(code).toMatch(/if\s*\(\s*!converged\s*\)/);
    // The coverage write must sit INSIDE that guard.
    const guardIdx = code.search(/if\s*\(\s*!converged\s*\)/);
    const coverageIdx = code.indexOf("from('topic_coverage')");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(coverageIdx).toBeGreaterThan(guardIdx);
  });
});

describe('the untick is idempotent', () => {
  it('deletes by the natural key, never by a row id read moments earlier', () => {
    // delete().eq('id', ...) targets a row that a concurrent request may have
    // already removed. The natural key states the intent — "this task must end
    // up un-ticked" — so deleting zero rows is success, not a silent miss.
    const deleteBlock = code.slice(code.indexOf("transition.action === 'delete'"), code.indexOf("transition.action === 'delete'") + 700);
    expect(deleteBlock).toContain("eq('task_id', taskId)");
    expect(deleteBlock).not.toMatch(/delete\(\)\s*\.eq\('id'/);
  });
});

describe('the response is read back, never assumed', () => {
  it('re-reads completions from the table after the write', () => {
    // A converged racer must return the same truthful state as the winner.
    // Assembling the response from what this request *believed* it wrote is
    // how two tabs end up disagreeing about what is ticked.
    const afterWrite = code.slice(code.indexOf('} else {'));
    expect(afterWrite).toContain("from('routine_task_completions')");
    expect(afterWrite).toContain("select('task_id, is_emergency, confidence')");
  });
});
