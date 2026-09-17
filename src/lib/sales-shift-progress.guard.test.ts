import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { shiftProgress, durationLabel, UNKNOWN_SHIFT, type ShiftWindow } from './sales-shift-progress';

// ── INCIDENT #99: A WORKED COUNT READ MID-SHIFT ─────────────────────────────
//
// Both counsellors work 15:00-21:00 IST. On 17 Sep `workedToday: 0` was read
// at 17:00 and reported as "worked nothing all day", and a 154-card deck was
// called "123 cards of decoration" off the same mid-shift snapshot. The same
// field had been misread the same way the day before — the counsellor ended
// that day at 39.
//
// The counts were never wrong. They had no denominator, and an unfinished
// number looks exactly like a finished one.

/** 2026-09-17 is a Thursday (IST weekday 4). */
const istAt = (h: number, m = 0) => Date.UTC(2026, 8, 17, h, m) - 5.5 * 3_600_000;
const SHIFT: ShiftWindow = { workStartIst: '15:00:00', workEndIst: '21:00:00', workDays: [1, 2, 3, 4, 5, 6] };

describe('a worked count is only a verdict once the shift is over', () => {
  it('the exact moment the founder was misled is not complete', () => {
    const p = shiftProgress(SHIFT, istAt(17, 0));
    expect(p.state).toBe('in_progress');
    expect(p.dayComplete, 'zero at 17:00 is two hours in, not a day').toBe(false);
    expect(p.minutesElapsed).toBe(120);
    expect(p.minutesTotal).toBe(360);
    expect(p.label).toBe('2h into a 6h shift');
  });

  it('before, during and after read differently', () => {
    expect(shiftProgress(SHIFT, istAt(11, 6)).state, 'a deck built at 11:06 precedes the shift').toBe('not_started');
    expect(shiftProgress(SHIFT, istAt(11, 6)).dayComplete).toBe(false);
    expect(shiftProgress(SHIFT, istAt(15, 1)).state).toBe('in_progress');
    expect(shiftProgress(SHIFT, istAt(20, 59)).dayComplete, 'one minute left is still not the answer').toBe(false);
    expect(shiftProgress(SHIFT, istAt(21, 0)).state).toBe('over');
    expect(shiftProgress(SHIFT, istAt(21, 0)).dayComplete).toBe(true);
  });

  it('a day off is finished, and an unconfigured shift is never guessed', () => {
    // 2026-09-20 is a Sunday; work_days is Mon-Sat.
    const sunday = Date.UTC(2026, 8, 20, 17, 0) - 5.5 * 3_600_000;
    const off = shiftProgress(SHIFT, sunday);
    expect(off.state).toBe('not_scheduled');
    expect(off.dayComplete, 'a Sunday zero is a complete answer, not a worry').toBe(true);

    const unknown = shiftProgress(UNKNOWN_SHIFT, istAt(17, 0));
    expect(unknown.state).toBe('unknown');
    expect(unknown.dayComplete, 'no window means no verdict either way (L1)').toBe(false);
    expect(unknown.minutesTotal, 'a guessed denominator is worse than none').toBeNull();

    // A malformed or inverted window is 'unknown', never a negative duration.
    expect(shiftProgress({ ...SHIFT, workEndIst: '09:00:00' }, istAt(17)).state).toBe('unknown');
    expect(shiftProgress({ ...SHIFT, workStartIst: 'nonsense' }, istAt(17)).state).toBe('unknown');
  });

  it('says a duration, never a rate, a target or a score', () => {
    expect(durationLabel(120)).toBe('2h');
    expect(durationLabel(140)).toBe('2h20m');
    expect(durationLabel(45)).toBe('45m');
    // SALES-OS §0: no P5 number may appear as a performance judgement, a
    // target, a quota, or an input to pay. This module must not learn to.
    const code = readFileSync('src/lib/sales-shift-progress.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const word of ['target', 'quota', 'expected', 'behind', 'ahead', 'shortfall', 'perHour']) {
      expect(code, `${word} has no place in a clock`).not.toContain(word);
    }
  });
});

describe("the founder's row carries the denominator", () => {
  it('coverage attaches a shift to every rep and never fails on a missing config', () => {
    const src = readFileSync('src/lib/sales-control-tower.ts', 'utf8');
    expect(src, 'RepCoverage carries it').toMatch(/shift:\s*ShiftProgress/);
    expect(src, 'and it is computed, not passed in').toContain('shiftProgress(shiftOf.get(id)');
    expect(src, 'a missing window falls back to the named unknown, never an invented one')
      .toContain('?? UNKNOWN_SHIFT');
    // The config read must not be able to take the whole view down: the counts
    // are still true without it, they just lose their denominator.
    const read = src.slice(src.indexOf('sales_rep_config'), src.indexOf('const by = new Map'));
    expect(read, 'a failed config read must not return { reps: null }').not.toContain('return { reps: null');
  });

  it('the tower shows the shift beside the count, and marks a partial number', () => {
    const page = readFileSync('src/app/admin/sales/tower/page.tsx', 'utf8');
    expect(page, 'the column exists').toMatch(/<th[^>]*>Shift<\/th>/);
    expect(page, 'and the label is rendered').toContain('c.shift.label');
    expect(page, 'an unfinished count must not look like a finished one').toContain('!c.shift.dayComplete');
    // The "Shift" header must sit before "Worked", so the denominator is read
    // first — a number is qualified by what precedes it, not by a later column.
    expect(page.indexOf('>Shift</th>')).toBeLessThan(page.indexOf('>Worked</th>'));
  });

  it('does not warn about unmarked cards before the shift has started', () => {
    // The amber "Unmarked" warning fired on cards dealt at 11:06 for a shift
    // that begins at 15:00 — a hole that had not had a chance to be filled.
    const page = readFileSync('src/app/admin/sales/tower/page.tsx', 'utf8');
    const cell = page.slice(page.indexOf('c.openToday > 0'), page.indexOf('c.openToday > 0') + 260);
    expect(cell).toContain("!== 'not_started'");
    expect(cell).toContain("!== 'not_scheduled'");
  });
});
