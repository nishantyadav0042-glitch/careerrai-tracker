import { describe, it, expect } from 'vitest';
import {
  BASELINE, BASELINE_FROZEN_ON, PLAN_TO_REALITY_RATIO,
  SIGNAL_BANDS, STRONG_LIFT_POINTS, NOISE_BAND_POINTS, readSignal,
} from './retention-baseline';

// A frozen baseline is only worth freezing if it cannot be quietly thawed.
// These tests are deliberately boring: they exist so that an edit which
// "improves" a number, drops a denominator, or redefines a metric into a
// success has to be a visible, arguing-with-a-test decision.

describe('the baseline is a record, not a working number', () => {
  it('is dated', () => {
    expect(BASELINE_FROZEN_ON).toBe('2026-09-16');
  });

  it('every metric carries a definition and a denominator', () => {
    for (const [key, m] of Object.entries(BASELINE)) {
      expect(m.definition.length, `${key} has no usable definition`).toBeGreaterThan(30);
      expect(m.n, `${key} quotes a value with no denominator — that is a rumour, not a metric`).toBeGreaterThan(0);
      expect(Number.isFinite(m.value), key).toBe(true);
    }
  });

  it('every percentage is a percentage', () => {
    for (const [key, m] of Object.entries(BASELINE)) {
      if (m.unit !== '%') continue;
      expect(m.value, key).toBeGreaterThanOrEqual(0);
      expect(m.value, key).toBeLessThanOrEqual(100);
    }
  });

  it('holds the three return rates in the order reality produces them', () => {
    // A student must log a second time within 7 days to have returned on day 2,
    // so day-2 can never exceed the 7-day figure. If it ever does, the queries
    // that produced them disagree and both are suspect.
    expect(BASELINE.day2_return.value).toBeLessThanOrEqual(BASELINE.second_log_within_7d.value);
    // And an already-returning student repeats more readily than a brand new
    // one — the gap between these two IS the first-week problem.
    expect(BASELINE.repeat_log_within_7d.value).toBeGreaterThan(BASELINE.second_log_within_7d.value);
  });

  it('one-and-done and the second-log rate describe the same cohort', () => {
    expect(BASELINE.one_and_done.n).toBe(BASELINE.second_log_within_7d.n);
  });
});

describe('the plan is measured against what students actually do', () => {
  it('records that we ask for many times what we get', () => {
    // 300 planned minutes against a median 0.6 reported hours.
    expect(PLAN_TO_REALITY_RATIO).toBeCloseTo(8.33, 1);
  });

  it('keeps the two sides of that ratio in their real units', () => {
    // study_duration is stored in HOURS (see /admin/leads: `Logged {x}h study`).
    // Reading it as minutes turns 36 minutes a day into 36 hours and inverts
    // the entire finding — the Incident #95 failure mode, exactly.
    expect(BASELINE.reported_hours_median.unit).toBe('hours');
    expect(BASELINE.planned_minutes_median.unit).toBe('minutes');
  });

  it('records that almost no routine is ever touched', () => {
    expect(BASELINE.routines_untouched.value).toBeGreaterThan(80);
    expect(BASELINE.task_completion.value).toBeLessThan(15);
  });
});

describe('the decision rule was set before the numbers arrived', () => {
  const base = BASELINE.repeat_log_within_7d.value; // 59.2

  it('a large lift with real preparation behind it is a strong signal', () => {
    expect(readSignal(base + STRONG_LIFT_POINTS, true)).toBe('strong');
  });

  it('the same lift with empty logs behind it is NOT', () => {
    // Students returning to tick nothing is an opening, not a preparation
    // event. Counting it as success is how a vanity metric is born.
    expect(readSignal(base + STRONG_LIFT_POINTS, true)).toBe('strong');
    expect(readSignal(base + STRONG_LIFT_POINTS, false)).toBe('weak');
  });

  it('movement inside the noise band is no signal, in either direction', () => {
    expect(readSignal(base + NOISE_BAND_POINTS - 0.1, true)).toBe('none');
    expect(readSignal(base - NOISE_BAND_POINTS + 0.1, true)).toBe('none');
  });

  it('a real fall is negative even when the logs look meaningful', () => {
    expect(readSignal(base - STRONG_LIFT_POINTS, true)).toBe('negative');
  });

  it('every band says what we DO, not merely what it means', () => {
    for (const [name, band] of Object.entries(SIGNAL_BANDS)) {
      expect(band.meaning.length, name).toBeGreaterThan(30);
      expect(band.then.length, name).toBeGreaterThan(30);
    }
  });

  it('"none" commits us to stopping, not to shipping another feature', () => {
    expect(SIGNAL_BANDS.none.then).toMatch(/interviews|not a feature|do not build|Stop/i);
  });
});
