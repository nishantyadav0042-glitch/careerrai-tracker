import { describe, it, expect } from 'vitest';
import { isIndependenceWindow, isIndependenceDay, INDEPENDENCE_LINE } from './independence';

// A seasonal theme that has to be taken down by hand is still on screen in
// September. These pin that it leaves on its own, in the students' timezone.
const at = (iso: string) => new Date(iso);

describe('the tricolour window opens and closes itself', () => {
  it('shows across 13-16 August', () => {
    for (const d of ['13', '14', '15', '16']) {
      expect(isIndependenceWindow(at(`2026-08-${d}T06:00:00Z`)), `Aug ${d}`).toBe(true);
    }
  });

  it('is gone before and after, with no human action', () => {
    expect(isIndependenceWindow(at('2026-08-12T06:00:00Z'))).toBe(false);
    expect(isIndependenceWindow(at('2026-08-17T06:00:00Z'))).toBe(false);
    expect(isIndependenceWindow(at('2026-09-15T06:00:00Z'))).toBe(false);
    expect(isIndependenceWindow(at('2026-01-15T06:00:00Z'))).toBe(false);
  });

  it('turns on IST, not UTC — the students are in India', () => {
    // 12 Aug 19:00 UTC is already 13 Aug 00:30 IST.
    expect(isIndependenceWindow(at('2026-08-12T19:00:00Z'))).toBe(true);
    // 16 Aug 19:00 UTC is 17 Aug IST — over.
    expect(isIndependenceWindow(at('2026-08-16T19:00:00Z'))).toBe(false);
  });

  it('the day itself is only the 15th', () => {
    expect(isIndependenceDay(at('2026-08-15T06:00:00Z'))).toBe(true);
    expect(isIndependenceDay(at('2026-08-14T06:00:00Z'))).toBe(false);
    expect(isIndependenceDay(at('2026-08-16T06:00:00Z'))).toBe(false);
  });
});

describe('the theme carries no claim it would have to defend', () => {
  it('the line states a product truth and quotes no statistic', () => {
    expect(INDEPENDENCE_LINE).not.toMatch(/\d/);
    expect(INDEPENDENCE_LINE).not.toMatch(/%/);
  });
});
