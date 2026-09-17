import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';
import {
  classifyCohorts, matchedRepeaterSample, SETTLE_DAYS,
  type CohortRow, type CohortStudent,
} from './interview-cohorts';

const ASOF = '2026-09-17';
const row = (id: string, joined: string, logs: string[], phone: string | null = '+919000000000'): CohortRow =>
  ({ studentId: id, name: `S-${id}`, phone, joined, logDates: logs });

describe('who counts as one-and-done', () => {
  it('a single log, long enough ago to have come back', () => {
    const { oneAndDone, repeaters } = classifyCohorts([row('a', '2026-07-01', ['2026-07-02'])], { asOf: ASOF });
    expect(oneAndDone).toHaveLength(1);
    expect(repeaters).toHaveLength(0);
  });

  it('two logs makes a repeater, however close together', () => {
    const { repeaters } = classifyCohorts([row('a', '2026-07-01', ['2026-07-02', '2026-07-03'])], { asOf: ASOF });
    expect(repeaters).toHaveLength(1);
  });

  it('a student who logged this week is in NEITHER roster', () => {
    // They have not yet had the week in which returning was possible.
    // Calling them one-and-done records our impatience as their behaviour.
    const r = classifyCohorts([row('a', '2026-09-14', ['2026-09-16'])], { asOf: ASOF });
    expect(r.oneAndDone).toHaveLength(0);
    expect(r.repeaters).toHaveLength(0);
    expect(r.tooRecent).toBe(1);
  });

  it('the settle boundary is inclusive at exactly SETTLE_DAYS', () => {
    const at = new Date(Date.parse(ASOF) - SETTLE_DAYS * 86_400_000).toISOString().slice(0, 10);
    expect(classifyCohorts([row('a', '2026-08-01', [at])], { asOf: ASOF }).oneAndDone).toHaveLength(1);
  });

  it('counts a repeated calendar day once', () => {
    const { oneAndDone } = classifyCohorts([row('a', '2026-07-01', ['2026-07-02', '2026-07-02'])], { asOf: ASOF });
    expect(oneAndDone).toHaveLength(1);
    expect(oneAndDone[0].logDays).toBe(1);
  });

  it('ignores a student with no logs at all', () => {
    const r = classifyCohorts([row('a', '2026-07-01', [])], { asOf: ASOF });
    expect(r.oneAndDone).toHaveLength(0);
    expect(r.tooRecent).toBe(0);
  });

  it('is deterministic, so the roster does not reshuffle between sittings', () => {
    const rows = [row('c', '2026-08-01', ['2026-08-02']), row('a', '2026-07-01', ['2026-07-02']), row('b', '2026-07-01', ['2026-07-03'])];
    const once = classifyCohorts(rows, { asOf: ASOF }).oneAndDone.map((s) => s.studentId);
    const twice = classifyCohorts([...rows].reverse(), { asOf: ASOF }).oneAndDone.map((s) => s.studentId);
    expect(once).toEqual(twice);
    expect(once).toEqual(['a', 'b', 'c']);
  });
});

describe('the repeater sample mirrors the signup months it is compared against', () => {
  const oad = (month: string, n: number): CohortStudent[] =>
    Array.from({ length: n }, (_, i) => ({
      studentId: `o${month}${i}`, name: 'x', phone: null, joined: `${month}-01`, joinedMonth: month,
      firstLog: `${month}-02`, lastLog: `${month}-02`, logDays: 1, spanDays: 0,
    }));
  const rep = (month: string, n: number, phone = true): CohortStudent[] =>
    Array.from({ length: n }, (_, i) => ({
      studentId: `r${month}${i}`, name: 'y', phone: phone ? '+91900' : null, joined: `${month}-01`, joinedMonth: month,
      firstLog: `${month}-02`, lastLog: `${month}-09`, logDays: 4, spanDays: 7,
    }));

  it('draws from the months the one-and-done roster is actually made of', () => {
    // Unmatched, this would contrast July repeaters with September
    // one-and-dones and recover the calendar rather than the behaviour.
    const sample = matchedRepeaterSample(oad('2026-07', 8).concat(oad('2026-09', 2)), rep('2026-07', 20).concat(rep('2026-09', 20)), 10);
    const july = sample.filter((s) => s.joinedMonth === '2026-07').length;
    expect(july).toBeGreaterThan(sample.filter((s) => s.joinedMonth === '2026-09').length);
  });

  it('returns the number asked for when the pool allows', () => {
    expect(matchedRepeaterSample(oad('2026-07', 10), rep('2026-07', 40), 10)).toHaveLength(10);
  });

  it('tops up rather than returning short when a month has no repeaters', () => {
    const sample = matchedRepeaterSample(oad('2026-05', 5).concat(oad('2026-07', 5)), rep('2026-07', 30), 10);
    expect(sample).toHaveLength(10);
  });

  it('prefers reachable students inside a month, never across months', () => {
    // Preferring reachable globally would re-sort the sample by whichever
    // month happened to collect more phone numbers.
    const sample = matchedRepeaterSample(oad('2026-07', 10), rep('2026-07', 4, false).concat(rep('2026-08', 10)), 4);
    expect(sample.every((s) => s.joinedMonth === '2026-07')).toBe(true);
  });

  it('never invents a sample out of nothing', () => {
    expect(matchedRepeaterSample([], rep('2026-07', 10), 10)).toEqual([]);
    expect(matchedRepeaterSample(oad('2026-07', 5), [], 10)).toEqual([]);
  });

  it('returns each student at most once', () => {
    const sample = matchedRepeaterSample(oad('2026-07', 10), rep('2026-07', 6), 10);
    expect(new Set(sample.map((s) => s.studentId)).size).toBe(sample.length);
  });
});

describe('this module must never become an outreach tool', () => {
  const src = codeOnly(readFileSync(join(process.cwd(), 'src/lib/interview-cohorts.ts'), 'utf8'));

  it('drafts no message and holds no script', () => {
    // A drafted message is a leading question with a send button attached, and
    // these interviews are worth nothing if they open by naming a theory.
    expect(src).not.toMatch(/wa\.me|whatsapp|draft|template|Hi \$\{|message/i);
  });

  it('writes nothing', () => {
    expect(src).not.toMatch(/\.update\(|\.insert\(|\.upsert\(|fetch\(/);
  });
});
