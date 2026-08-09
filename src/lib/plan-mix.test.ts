import { describe, it, expect } from 'vitest';
import {
  sectionsForDay, splitDayHours, drawFromSection,
  THREE_SECTION_MIN_HOURS, type QueueTopic,
} from './plan-mix';

describe('the mixed-day engine builds topper-style days', () => {
  it('≥3h touches all three sections, weakest first', () => {
    const s = sectionsForDay(6, 'DILR', 0);
    expect(s[0]).toBe('DILR');
    expect(new Set(s)).toEqual(new Set(['QA', 'DILR', 'VARC']));
  });

  it('<3h touches two sections — always the weakest, plus a rotating one', () => {
    const d0 = sectionsForDay(2, 'QA', 0);
    const d1 = sectionsForDay(2, 'QA', 1);
    expect(d0).toHaveLength(2);
    expect(d0[0]).toBe('QA');
    expect(d1[0]).toBe('QA');
    // The second section rotates across days so both non-weakest are still hit.
    expect(d0[1]).not.toBe(d1[1]);
  });

  it('never a single-subject study day (the whole bug)', () => {
    for (const h of [2, 2.5, 3, 4, 6, 10]) {
      expect(sectionsForDay(h, 'VARC', 0).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('splits hours weighted to the weakest section, summing to the day', () => {
    const split = splitDayHours(['QA', 'DILR', 'VARC'], 6, 'QA');
    const total = [...split.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(6);
    // Weakest (QA) gets the most; VARC the least.
    expect(split.get('QA')!).toBeGreaterThan(split.get('DILR')!);
    expect(split.get('DILR')!).toBeGreaterThanOrEqual(split.get('VARC')!);
  });

  it('a 2h day splits into two real blocks, not slivers', () => {
    const split = splitDayHours(sectionsForDay(2, 'DILR', 0), 2, 'DILR');
    expect([...split.values()].reduce((a, b) => a + b, 0)).toBe(2);
    for (const h of split.values()) expect(h).toBeGreaterThanOrEqual(0.5);
  });

  it('draws topics from a section queue, advancing across days (a topic can span days)', () => {
    const queue: QueueTopic[] = [
      { topic: 'Reading Comprehension', section: 'VARC', hours: 5, mode: 'learn' },
      { topic: 'Para Jumbles', section: 'VARC', hours: 3, mode: 'practice' },
    ];
    const day1 = drawFromSection(queue, 2);
    expect(day1[0].topic).toBe('Reading Comprehension');
    expect(day1[0].hours).toBe(2);
    // 3h of RC remain on the queue for tomorrow — it spans days, but only in the
    // VARC slot, so other sections still fill the rest of each day.
    expect(queue[0].hours).toBe(3);
  });

  it('THREE_SECTION_MIN_HOURS is the documented 3h threshold', () => {
    expect(THREE_SECTION_MIN_HOURS).toBe(3);
  });
});
