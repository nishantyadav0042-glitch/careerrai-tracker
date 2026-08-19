import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── G15: the A1 probe was watching the wrong door ───────────────────────────
//
// completion_write produced ZERO events since it deployed. The probe was not
// broken; it covered only ONE of the two ways a completion is written.
//
//   · Instrumented (G10B): the log sheet's integrated fan-out in
//     DailyTrackerApp, which fires only when a student opens the sheet AND
//     ticks plan topics there.
//   · NOT instrumented: TodaysRoutineCard's tick, which POSTs the same route
//     directly. This is the path students actually use.
//
// Evidence: the probe went live 19 Aug 06:47. The last `daily_log` event --
// the only event the instrumented path can follow -- was 18 Aug. So the
// covered path was not exercised once in the probe's lifetime, while the
// uncovered one produced the day's only real daily_reports write (12:05,
// stamped `credited`).
//
// A1 was never measured because the denominator lived somewhere the probe
// could not see.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const CARD = 'src/components/DailyTracker/TodaysRoutineCard.tsx';
const APP = 'src/components/DailyTracker/DailyTrackerApp.tsx';

describe('both write paths report their outcome', () => {
  it('the log-sheet fan-out still does', () => {
    expect(read(APP)).toMatch(/track\('completion_write'/);
  });

  it('the plan-card tick now does too', () => {
    expect(read(CARD)).toMatch(/track\('completion_write'/);
  });

  it('each surface says which one it is', () => {
    expect(read(CARD), 'without this the two paths are indistinguishable in one stream')
      .toMatch(/surface: 'plan_card'/);
  });
});

describe('the probe records a denominator, not just failures', () => {
  it('a successful tick is recorded too', () => {
    // "How often does a tick fail to become a study day" needs both halves.
    // Counting only failures gives a numerator and no rate.
    const s = read(CARD);
    expect(s).toMatch(/track\('completion_write', \{[\s\S]{0,200}ok: true/);
  });

  it('a refused tick is recorded with its status', () => {
    expect(read(CARD)).toMatch(/ok: false, status: res\.status, kind: 'http'/);
  });

  it('it carries dayClosed — the thing A1 is actually about', () => {
    // A tick can succeed while the day never closes; that IS the A1 symptom.
    expect(read(CARD)).toMatch(/dayClosed: json\.dayClosed/);
  });

  it('it carries coverageAdvanceFailed, which G3 made truthful', () => {
    expect(read(CARD)).toMatch(/coverageAdvanceFailed: json\.coverageAdvanceFailed/);
  });
});

describe('scope containment', () => {
  it('the tick behaviour itself is unchanged', () => {
    const s = read(CARD);
    expect(s, 'a failed tick must still surface an error and leave the circle empty')
      .toMatch(/setTickError\(body\.error \?\? 'Could not save that/);
    expect(s, 'the dayClosed warning must survive')
      .toMatch(/Saved your tick, but today isn’t counted yet/);
  });

  it('the missing network handler is RECORDED, not silently added', () => {
    // toggleTask has only a `finally`. Adding a catch would swallow a throw
    // that currently escapes -- a behaviour change, out of scope for an
    // instrumentation gate, and a named A1 suspect in its own right.
    const s = read(CARD);
    expect(s, 'the gap must be documented at the site').toMatch(/no `catch`/);
    expect(s, "and must NOT have been quietly filled")
      .not.toMatch(/setBusyTaskId\(task\.id\);[\s\S]{0,600}\} catch \{[\s\S]{0,200}setTickError/);
  });
});
