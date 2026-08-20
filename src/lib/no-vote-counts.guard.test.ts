import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { helpfulPct, netScore, HELPFUL_PCT_MIN_VOTES } from './os/insight-feed';

// ── A card shows a ratio or nothing — never a count ────────────────────────
//
// Founder, 20 Aug: the vote numbers are small, so do not print them; show a
// percentage instead. Both halves matter.
//
// Not printing the count is the easy half. The hard half is refusing to print
// a percentage that the sample cannot carry: "100% found this useful" from
// two votes is a worse lie than the two votes were, and it is exactly the
// failure this codebase has removed three times already (challenge.ts
// SPLIT_MIN_ATTEMPTS, peer-cohort density gate, the insight engine's banned
// exam statistics). So below the floor a card shows NO number at all.
//
// The vote still visibly does something: the button lights up and stays lit,
// and the item moves in the ranking. The score is computed for that ordering
// and never rendered.

const read = (p: string) => readFileSync(p, 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the percentage is real or it is absent', () => {
  it('says nothing at all below the floor', () => {
    for (const n of [0, 1, 2, 3, 5, HELPFUL_PCT_MIN_VOTES - 1]) {
      expect(helpfulPct({ helpfulVotes: n, totalVotes: n }), `${n} votes must not produce a %`).toBeNull();
    }
  });

  it('speaks once the sample can carry it', () => {
    expect(helpfulPct({ helpfulVotes: 9, totalVotes: 10 })).toBe(90);
    expect(helpfulPct({ helpfulVotes: 41, totalVotes: 50 })).toBe(82);
  });

  it('a downvote genuinely lowers it — this is usefulness, not applause', () => {
    const all = helpfulPct({ helpfulVotes: 12, totalVotes: 12 })!;
    const some = helpfulPct({ helpfulVotes: 8, totalVotes: 12 })!;
    expect(some).toBeLessThan(all);
  });
});

describe('no raw vote count reaches a student', () => {
  it('the API serves a percentage, not a score or a count', () => {
    const s = code('src/app/api/community/insights/route.ts');
    expect(s).toContain('helpfulPct: d.helpfulPct');
    expect(s).not.toMatch(/score: d\.|helpfulCount: d\./);
  });

  it('the card renders the percentage and nothing numeric beside it', () => {
    const s = code('src/components/student-insights.tsx');
    expect(s).toContain('% found this useful');
    // The old shapes: a bare {score} pill, or "· {count}" next to the button.
    expect(s, 'a raw score pill must not return').not.toMatch(/\{score\}/);
    expect(s, 'a raw count must not return').not.toMatch(/\{item\.helpfulCount\}|· \{/);
  });

  it('the ranking still uses the real score — it is computed, never printed', () => {
    // Hiding the number must not mean losing the signal: usefulness is what
    // decides which item rises.
    expect(netScore({ helpfulVotes: 9, totalVotes: 11 })).toBe(7);
    expect(code('src/lib/os/insight-feed.ts')).toContain('netScore(b) - netScore(a)');
  });

  it('the vote still shows a consequence without any number', () => {
    const s = code('src/components/student-insights.tsx');
    // The button state IS the immediate feedback.
    expect(s).toContain("myVote === 'up'");
    expect(s).toContain("myVote === 'down'");
  });
});
