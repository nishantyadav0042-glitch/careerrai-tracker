import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reactionLine, ALL_REACTIONS } from './challenge-reaction';

describe('the beat before the teaching', () => {
  it('is stable for one attempt — never swaps under the student mid-read', () => {
    const first = reactionLine(false, 'challenge-abc');
    for (let i = 0; i < 20; i++) expect(reactionLine(false, 'challenge-abc')).toBe(first);
  });

  it('varies across questions, so a daily student is not read the same line', () => {
    const seen = new Set(
      Array.from({ length: 40 }, (_, i) => reactionLine(true, `challenge-${i}`))
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('separates right from wrong', () => {
    const right = new Set(Array.from({ length: 40 }, (_, i) => reactionLine(true, `q${i}`)));
    const wrong = new Set(Array.from({ length: 40 }, (_, i) => reactionLine(false, `q${i}`)));
    for (const r of right) expect(wrong.has(r)).toBe(false);
  });
});

describe('tone — this fires on a student who just got it wrong', () => {
  it('never uses a word that reads as failure', () => {
    for (const line of ALL_REACTIONS) {
      for (const bad of ['wrong.', 'incorrect', 'failed', 'obviously', 'should have', 'easy']) {
        expect(line.toLowerCase(), `"${line}"`).not.toContain(bad);
      }
    }
  });

  it('never inflates a 60-second question into a triumph', () => {
    for (const line of ALL_REACTIONS) {
      for (const flattery of ['genius', 'brilliant', 'amazing', 'incredible', '!!']) {
        expect(line.toLowerCase(), `"${line}"`).not.toContain(flattery);
      }
    }
  });
});

describe('no small numbers on the challenge surface either', () => {
  it('says nothing at all when there is no real community number', () => {
    const card = readFileSync('src/components/daily-challenge-card.tsx', 'utf8');
    // First this printed "one of the first {attemptCount}", which rendered as
    // "one of the first 2" and reported our size. That was replaced by a
    // countless "you're among the first" — which the founder then cut too
    // (13 Aug): it is a consolation line dressed as a stat, tells the student
    // nothing about their answer, and on a quiet day still advertises an
    // empty room. The correct empty state is silence.
    expect(card).not.toMatch(/first \{verdict\.attemptCount\}/);
    expect(card).not.toContain('among the first');
  });

  it('the real percentage is still gated behind a live count', () => {
    const card = readFileSync('src/components/daily-challenge-card.tsx', 'utf8');
    expect(card).toContain('verdict.communityCorrectPct != null');
  });
});
