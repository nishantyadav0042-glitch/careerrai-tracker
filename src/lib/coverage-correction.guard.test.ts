import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── A student must be able to correct their own record ──────────────────────
//
// Backbone audit, 13 Aug. Coverage could only ever move FORWARD:
//
//   · the daily tick advances it (green/blue only);
//   · the weekly review is forward-only BY DESIGN — a mis-tap in a
//     tap-through of twelve topics must not rewrite history;
//   · and the two escape hatches the code itself named — "the red confidence
//     signal, the full matrix editor" (coverage-status.isForwardMove) — did
//     not exist. The red signal had no UI anywhere, and the matrix page was
//     read-only.
//
// So a student who genuinely forgot a chapter had no way to say so, and the
// planner went on believing it was done — treating a cold topic as covered is
// exactly the error that costs marks in November.
//
// The door now exists where the design always said it should: the coverage
// map, one named topic at a time, on purpose.

const PAGE = 'src/app/student/plan/topics/page.tsx';
const API = 'src/app/api/coverage/route.ts';

describe('the coverage map can move a topic in BOTH directions', () => {
  const src = () => readFileSync(PAGE, 'utf8');

  it('the status pill is a real control, not a label', () => {
    const s = src();
    expect(s).toContain('aria-label={`Change status: ${t.topic}`}');
    expect(s).toContain('void setStatus(t, s)');
  });

  it('offers every student-declarable status, including ones BELOW the current', () => {
    // The whole point: 'not_started' and 'learning' must be reachable from
    // 'revising'. A forward-only list here would rebuild the original bug.
    const s = src();
    expect(s).toContain("const EDITABLE: Status[] = ['not_started', 'learning', 'practicing', 'revising']");
  });

  it('never offers exam_ready — that one is earned from evidence', () => {
    const s = src();
    expect(s).not.toMatch(/EDITABLE[^\]]*exam_ready/);
  });

  it('writes through the API that validates, and refreshes what reads it', () => {
    const s = src();
    expect(s).toContain("fetch('/api/coverage'");
    expect(s).toContain("invalidateQueries({ queryKey: ['blueprint'] })");
  });

  it('a failed save is shown, never swallowed', () => {
    expect(src()).toContain('setSaveError');
  });

  it('tells the student a step back is safe', () => {
    // Without this the control is there but nobody dares use it, and we are
    // back to a matrix that only ever inflates.
    expect(src()).toContain('Moving it back is fine');
  });
});

describe('the endpoint behind it stays honest', () => {
  it('still refuses a self-assigned exam_ready', () => {
    // validateCoverageEntry(body, false) — the false is the exam_ready gate.
    expect(readFileSync(API, 'utf8')).toContain('validateCoverageEntry(body, false)');
  });

  it('scopes the write to the signed-in student', () => {
    expect(readFileSync(API, 'utf8')).toContain('student_id: user.id');
  });
});

describe('the daily flow stays advance-only', () => {
  // Regression belongs in the deliberate flow above, never in a tap a student
  // makes in a hurry on the home screen.
  const CARD = 'src/components/DailyTracker/TodaysRoutineCard.tsx';

  it('the plan card sends only the two advancing portions', () => {
    const s = readFileSync(CARD, 'utf8');
    expect(s).toContain("onPick('half')");
    expect(s).toContain("onPick('full')");
    // The four-option 🟡/🔴 picker was declared here for months and never
    // rendered — dead code that read like a live feature.
    expect(s).not.toContain('CONFIDENCE_OPTIONS');
  });

  it('the unreachable 30-minute emergency budget is gone from the client', () => {
    // `budget` had no setter, so is_emergency was permanently false. The
    // crisis day is the Busy Day button now.
    const s = readFileSync(CARD, 'utf8');
    expect(s).not.toContain('type TimeBudget');
    expect(s).not.toContain('budget === 30');
  });

  it('but the SERVER still understands historical emergency completions', () => {
    // Those rows exist; removing the read would silently re-interpret them.
    const s = readFileSync('src/app/api/routine/complete-task/route.ts', 'utf8');
    expect(s).toContain('emergencyMinimumDone');
  });
});
