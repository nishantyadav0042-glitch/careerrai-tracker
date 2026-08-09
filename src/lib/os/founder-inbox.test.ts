import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The inbox is decisions, not charts. These tests hold that line — they read
// the module's shape, since the assembly itself needs a live database.

const src = readFileSync('src/lib/os/founder-inbox.ts', 'utf8');

describe('the inbox is work, not a dashboard', () => {
  it('every item carries an action and a route', () => {
    // Co-founder review: "every widget ends with what should Nishant do?" An
    // item with no action is a chart, and this file does not do charts. The
    // InboxItem type makes both required; this asserts the type has not been
    // loosened to allow a chart back in.
    expect(src).toMatch(/action:\s*string/);
    expect(src).toMatch(/route:\s*string/);
    // Every raw item literal must set both.
    const items = src.split(/key:\s*'/).slice(1);
    expect(items.length).toBeGreaterThan(5);
    for (const block of items) {
      const head = block.slice(0, 400);
      expect(head).toContain('action:');
      expect(head).toContain('route:');
    }
  });

  it('shows only OPEN work — a cleared item is not a row of zeros', () => {
    // "When I clear the inbox, CareerRai is healthy." An inbox that lists
    // zeros is a dashboard wearing an inbox's clothes.
    expect(src).toContain('.filter((r) => r.count > 0)');
  });

  it('sorts critical before high before normal', () => {
    const rank = src.slice(src.indexOf('const rank ='));
    expect(rank.indexOf('critical')).toBeLessThan(rank.indexOf('high'));
    expect(rank.indexOf('high')).toBeLessThan(rank.indexOf('normal'));
  });

  it('never invents a number it cannot measure', () => {
    // The review asked for "today's AI cost". Gemini token usage has never been
    // stored, so it must NOT appear as an inbox ITEM with a made-up figure.
    // Comments are stripped first — this file explains WHY the item is absent,
    // and that explanation names the thing it is refusing to fake.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code.toLowerCase()).not.toMatch(/ai cost|gemini cost|token cost/);
  });

  it('ranks a paying student with no mentor as the worst state', () => {
    // Weighting encodes judgement: we already took their money.
    expect(src).toMatch(/paid_no_buddy:\s*\{\s*per:\s*6/);
    expect(src).toContain("severity: 'critical'");
  });
});

describe('the founder score is honest arithmetic', () => {
  it('is clamped to 0-100', () => {
    expect(src).toContain('Math.max(0, Math.min(100');
  });

  it('is 100 only when nothing is open', () => {
    // penalty starts at 0 and only rises with open items, so an empty system
    // scores 100 and every open item lowers it.
    expect(src).toContain('100 - penalty');
  });
});
