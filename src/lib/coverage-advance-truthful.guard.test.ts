import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// ── G3 (0C.3G / J12) — a failed coverage advance is no longer silent ────────
//
// `advanceCoverage` has two failure branches — a failed read of
// `topic_coverage` (readErr) and a failed upsert into it (upsertErr) — and
// both were `console.error`'d and swallowed. The function returned
// `Promise<void>`: structurally incapable of telling its caller anything went
// wrong. The tick itself still saves and the route still returns 200, so the
// student's Preparation Map can silently fail to move while the UI reports
// success.
//
// THE ESTABLISHED PATTERN THIS GATE EXTENDS, not invents. The same route
// already has this exact shape for a different secondary write: the RPC
// close-day failure sets `dayClosed = !rpcError` and returns it in the
// response, with the comment "Silently failing here is the worst outcome on
// this route... we report the partial truth rather than pretending either
// way." advanceCoverage gets the identical treatment — a boolean result,
// carried into the response — not a new philosophy.
//
// WHAT THIS IS NOT: advanceCoverage's own early return (no topic on the task,
// or no confidence signal) is NOT a failure — a Mock/General task has no
// topic-bearing coverage to advance, and that is correct, not an error. Only
// the two genuine failure branches (readErr, upsertErr) may report false.
//
// Source-level guards, matching the house pattern for testing route-internal
// functions throughout this project (tick-idempotency.guard.test.ts,
// tick-is-the-log.guard.test.ts) — advanceCoverage is intentionally not
// exported, and this gate does not export it either.

const ROUTE = join(process.cwd(), 'src/app/api/routine/complete-task/route.ts');
const src = readFileSync(ROUTE, 'utf8');
const code = src.split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('advanceCoverage can report failure to its caller', () => {
  it('no longer returns void — it returns whether the advance held', () => {
    expect(code, 'the function signature must change to signal outcome')
      .not.toMatch(/async function advanceCoverage\(([\s\S]{0,300})\): Promise<void>/);
    expect(code).toMatch(/async function advanceCoverage\(([\s\S]{0,300})\): Promise<boolean>/);
  });

  it('the no-topic / no-confidence early return is NOT a failure', () => {
    const i = code.indexOf('if (!effectiveConfidence || !completedTask?.topic)');
    expect(i, 'the early-return guard must still exist').toBeGreaterThan(-1);
    const line = code.slice(i, code.indexOf('\n', i) + 1);
    expect(line, 'nothing to advance is correct, not an error').toContain('return true');
  });

  it('a failed coverage READ reports failure, not just a console.error', () => {
    const i = code.indexOf("'[complete-task] coverage read failed, skipping advance'");
    expect(i).toBeGreaterThan(-1);
    const block = code.slice(i, i + 200);
    expect(block, 'the log must survive — this gate adds truthful reporting, not removes diagnosis')
      .toContain('coverage read failed');
    expect(block).toContain('return false');
  });

  it('a failed coverage UPSERT reports failure, not just a console.error', () => {
    const i = code.indexOf("'[complete-task] coverage upsert failed'");
    expect(i).toBeGreaterThan(-1);
    const block = code.slice(i, i + 200);
    expect(block).toContain('return false');
  });

  it('a successful upsert reports success', () => {
    const upsertIdx = code.indexOf("await admin.from('topic_coverage').upsert(");
    const tail = code.slice(upsertIdx, upsertIdx + 400);
    expect(tail).toMatch(/return true;\s*}?\s*$|return true;/);
  });
});

describe('the route surfaces the result — mirroring the existing dayClosed pattern exactly', () => {
  it('both advanceCoverage call sites capture the returned boolean', () => {
    const calls = code.match(/await advanceCoverage\(admin, user\.id, tasks, taskId, effectiveConfidence\);/g) ?? [];
    expect(calls.length, 'both the upgrade path and the insert path call it').toBe(2);
    // Bare, uncaptured calls must be gone — the whole point of this gate.
    expect(code).not.toMatch(/^\s*await advanceCoverage\(/m);
  });

  it('a shared flag tracks failure across both call sites, defaulting to false', () => {
    expect(code).toMatch(/let coverageAdvanceFailed = false;/);
  });

  it('the response includes the flag, alongside dayClosed — same shape, same honesty', () => {
    const returnBlock = code.slice(code.lastIndexOf('return NextResponse.json({'));
    expect(returnBlock).toContain('dayClosed');
    expect(returnBlock).toContain('coverageAdvanceFailed');
  });
});

describe('coverage semantics are untouched — this gate is acknowledgement only', () => {
  it('applyConfidenceSignal and the never-regress floor are unchanged', () => {
    expect(code).toContain('applyConfidenceSignal(current, effectiveConfidence as ConfidenceSignal)');
    expect(code).toContain('highestStatus(normalizeStatus(current), advanced)');
  });

  it('the upsert target, conflict key and status computation are unchanged', () => {
    expect(code).toContain("onConflict: 'student_id,section,topic'");
  });

  it('the read-error-is-not-a-blank-row protection is unchanged', () => {
    // This lives in a comment, which `code` strips — check the raw source.
    expect(src).toContain('A FAILED READ IS NOT A BLANK ROW');
  });
});

describe('scope containment — J6, the Fact Registry and schema are untouched', () => {
  it('no study_duration merge logic changed', () => {
    expect(code).toContain('const mergedHours = Math.max(earned, existingLog?.study_duration ?? 0);');
  });

  it('no Fact Registry import appears in this route', () => {
    expect(src).not.toMatch(/from ['"]@\/lib\/facts\/registry['"]/);
  });

  it('the topic_coverage table schema is untouched — no new/modified migration', () => {
    // A fixed date prefix is unreliable — other work landed migrations on the
    // same calendar day. Ask git what's actually new or changed instead.
    const status = execSync('git status --porcelain supabase/migrations', { cwd: process.cwd() }).toString();
    expect(status, 'no new or modified migration file for this gate').toBe('');
  });
});
