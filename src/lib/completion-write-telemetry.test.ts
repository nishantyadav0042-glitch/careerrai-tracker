import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── G10B — make the integrated fan-out's failures observable ────────────────
//
// A1: 33 same-day logs carry credited hours with zero completion rows. G9
// established that the requests are almost certainly sent, that the client's
// payload construction is sound, and that NOTHING RECORDS WHAT RESPONSE THEY
// RECEIVED — so the mechanism behind 30 of them cannot be named.
//
// The plan-card tick (TodaysRoutineCard.toggleTask) already checks `res.ok`
// and shows the student an error. That is precisely why that path does not
// produce A1. The integrated fan-out is the only silent caller, so it is the
// only one instrumented here.
//
// THIS GATE ADDS OBSERVABILITY AND NOTHING ELSE. No retry, no reorder, no
// transaction, no change to what is written or when. A failed call still fails
// exactly as before — it is now merely recorded on the way past.
//
// WHY NOT JUST SURFACE THE ERROR TO THE STUDENT TOO: that is a product
// decision about what a partially-saved log should say, and it is unruled. The
// diagnostic question comes first and costs nothing.

const APP = readFileSync(join(process.cwd(), 'src/components/DailyTracker/DailyTrackerApp.tsx'), 'utf8');
const JOURNEY = readFileSync(join(process.cwd(), 'src/lib/journey.ts'), 'utf8');
const CARD = readFileSync(join(process.cwd(), 'src/components/DailyTracker/TodaysRoutineCard.tsx'), 'utf8');

const fanOut = () => {
  const i = APP.indexOf("fetch('/api/routine/complete-task'");
  expect(i, 'the integrated fan-out must still exist').toBeGreaterThan(-1);
  return APP.slice(Math.max(0, i - 1400), i + 1400);
};

describe('the event is declared, not smuggled in', () => {
  it('completion_write is a registered EventName', () => {
    // journey.ts types EventName as a closed union — an undeclared event is a
    // typecheck failure, which is the guard that caught the last new event.
    expect(JOURNEY).toContain("'completion_write'");
  });
});

describe('every outcome of every call is recorded', () => {
  it('a successful call is recorded', () => {
    const s = fanOut();
    expect(s).toMatch(/track\('completion_write'/);
    // The success flag is carried from the response (`ok: res.ok`) rather than
    // hardcoded — a literal `true` would be worse code, so the assertion pins
    // the INTENT: every call reports whether it succeeded, not only failures.
    expect(s, 'success must be distinguishable, not just failure').toMatch(/ok:\s*res\.ok/);
  });

  it('an HTTP error is recorded as a failure, not treated as success', () => {
    // The whole defect: fetch RESOLVES on 400/404/500, so without an .ok check
    // an error is indistinguishable from success at the call site.
    const s = fanOut();
    expect(s, 'the response status must be inspected').toMatch(/res\.ok|response\.ok/);
    expect(s, 'and the status code must be carried').toMatch(/status/);
  });

  it('a network failure is distinguishable from an HTTP response', () => {
    // fetch REJECTS on network failure and RESOLVES on an HTTP error. The two
    // need different labels or the telemetry cannot separate "never arrived"
    // from "arrived and was refused" — which is the central G9 question.
    const s = fanOut();
    expect(s).toMatch(/'network'/);
    expect(s).toMatch(/'http'/);
  });

  it('the client-side date is carried, so a date mismatch is visible', () => {
    // complete-task resolves the routine by its OWN getLogDateString(),
    // independently of the date the log used. G9 named that as a route to a
    // silent 404/400. Recording what the client believed makes it checkable.
    expect(fanOut()).toMatch(/clientDate|forDate/);
  });

  it('the failing task id is carried', () => {
    expect(fanOut()).toMatch(/taskId|task_id/);
  });
});

describe('no student data enters telemetry', () => {
  it('only ids, status and category are recorded', () => {
    const s = fanOut();
    for (const forbidden of ['full_name', 'phone', 'email', 'notes', 'study_duration', 'hours']) {
      expect(s, `${forbidden} must not be sent to telemetry`).not.toMatch(
        new RegExp(`track\\('completion_write'[^)]*${forbidden}`)
      );
    }
  });
});

describe('product behaviour is unchanged', () => {
  it('the silent catch is replaced by a recorded catch, not by a retry', () => {
    const s = fanOut();
    expect(s, 'no retry loop may be introduced by an observability gate')
      .not.toMatch(/for\s*\(let attempt|retry|setTimeout/);
  });

  it('the fan-out is still awaited and still does not block the log', () => {
    expect(fanOut()).toMatch(/await Promise\.all/);
    // The log write still happens first and is still independent of the result.
    expect(APP).toMatch(/const result = await submitLog\(/);
  });

  it('credit and completion ordering is untouched — that is G10, not this gate', () => {
    const submitIdx = APP.indexOf('const result = await submitLog(');
    const fanIdx = APP.indexOf("fetch('/api/routine/complete-task'");
    expect(submitIdx).toBeGreaterThan(-1);
    expect(fanIdx).toBeGreaterThan(submitIdx);
  });

  it('the plan-card tick is untouched — it already fails loudly', () => {
    expect(CARD).toContain('if (!res.ok)');
    expect(CARD).toContain('setTickError');
  });
});
