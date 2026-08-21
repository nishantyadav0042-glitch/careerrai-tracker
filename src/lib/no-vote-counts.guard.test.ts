import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { helpfulPct, netScore } from './os/insight-feed';

// ── A card shows a ratio or nothing — never a count ────────────────────────
//
// Founder, 20 Aug: the vote numbers are small, so do not print them; show a
// percentage instead. Both halves matter.
//
// There is NO minimum (founder, 21 Aug). I had added a 10-vote floor by
// carrying across the "a percentage is noise wearing a suit" rule; the
// founder overruled it and the distinction is real. That rule guards a claim
// ABOUT THE WORLD inferred from a sample. This is not inferred — it is a
// direct readout of the votes cast. One vote, one helpful, 100%: true as
// written. A floor also brought back the original failure, a vote whose
// consequence you cannot see, and made a deliberately simple system carry a
// rule no student would ever guess.
//
// The vote still visibly does something: the button lights up and stays lit,
// and the item moves in the ranking. The score is computed for that ordering
// and never rendered.

const read = (p: string) => readFileSync(p, 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('every vote shows up, from the very first one', () => {
  it('has no minimum — one vote already speaks', () => {
    expect(helpfulPct({ helpfulVotes: 1, totalVotes: 1 })).toBe(100);
    expect(helpfulPct({ helpfulVotes: 2, totalVotes: 2 })).toBe(100);
    expect(helpfulPct({ helpfulVotes: 1, totalVotes: 3 })).toBe(33);
  });

  it('is silent only when nobody has voted', () => {
    expect(helpfulPct({ helpfulVotes: 0, totalVotes: 0 })).toBeNull();
  });

  it('reads the same at every scale', () => {
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
