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

  it('a network fault is now recorded, attributed AND shown to the student', () => {
    // The upstream audit found crash-reporter DOES catch the escaping throw
    // (70 "Load failed" rows since 26 Jul) -- but client_errors has no user_id,
    // drops where/detail after fingerprinting, dedupes per session, and the
    // student was told nothing. Caught is not handled.
    const s = read(CARD);
    expect(s, 'the network branch must emit the probe event')
      .toMatch(/\} catch \(e\) \{[\s\S]{0,1400}kind: 'network', surface: 'plan_card'/);
    expect(s, 'and must locate the failure for client_errors')
      .toMatch(/reportHandledError\(e, \{ where: 'plan-card:tick', detail: task\.id \}\)/);
    expect(s, 'and must tell the student the tick did not save')
      .toMatch(/\} catch \(e\) \{[\s\S]{0,1600}setTickError\(/);
  });
});
