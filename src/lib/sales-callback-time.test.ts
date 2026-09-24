/**
 * Founder, 24 Sep 2026: "For callback always ask Anshul to add time or set time."
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { callbackTimeProblem } from './sales-callback-time';

const NOW = Date.parse('2026-09-24T20:00:00+05:30');

describe('a callback carries the time the student asked for', () => {
  it('no time, or a malformed one, cannot be saved', () => {
    expect(callbackTimeProblem('', NOW)).toMatch(/Set the time/);
    expect(callbackTimeProblem(undefined, NOW)).toMatch(/Set the time/);
    expect(callbackTimeProblem('tomorrow evening', NOW)).toMatch(/Set the time/);
  });

  it('a time that has already passed is refused — the old 6 PM default did this after 6 PM', () => {
    expect(callbackTimeProblem('2026-09-24T18:00', NOW)).toMatch(/already passed/);
  });

  it('a future time, read as IST, is accepted', () => {
    expect(callbackTimeProblem('2026-09-24T20:30', NOW)).toBeNull();
    expect(callbackTimeProblem('2026-09-25T11:00', NOW)).toBeNull();
  });

  it('neither screen pre-fills a time, and the server applies the same rule', () => {
    for (const f of ['components/call-deck.tsx', 'components/sales-log.tsx']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8');
      expect(src, f).not.toMatch(/defaultCallback/);
      expect(src, f).toMatch(/value=\{callbackAt\}/);
      expect(src, f).toMatch(/callbackTimeProblem\(callbackAt, Date\.now\(\)\)/);
    }
    const route = readFileSync(join(__dirname, '..', 'app', 'api', 'sales', 'log', 'route.ts'), 'utf8');
    expect(route).toMatch(/callbackTimeProblem\(callbackAt, Date\.now\(\)\)/);
  });
});
