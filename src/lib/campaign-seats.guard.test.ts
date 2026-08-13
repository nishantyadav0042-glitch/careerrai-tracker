import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mayShowSeatsLeft, CAMPAIGN } from './campaign';

// ── "50 of 50 spots left" ───────────────────────────────────────────────────
//
// 13 Aug, founder, looking at the live Home screen: this line does not read as
// scarcity. It reads as a verdict — a precise, confident statement that not one
// person has bought, printed directly above the buy button.
//
// It is the same failure as a small vote count, except worse: a weak signal
// pointing the wrong way is survivable; a STRONG signal pointing the wrong way
// converts against you. Three surfaces were carrying it (Home card, /offer,
// campaign push) after we had already encoded the rule on three others.
//
// These tests exist so it cannot come back on any of them.

describe('a seat counter that announces nobody bought', () => {
  it('is hidden at the exact number that shipped — 50 of 50', () => {
    expect(mayShowSeatsLeft(50, 50)).toBe(false);
  });

  it('stays hidden while most seats are still there', () => {
    for (const left of [50, 45, 40, 35, 30, 26]) {
      expect(mayShowSeatsLeft(left, 50), `${left} left must stay hidden`).toBe(false);
    }
  });

  it('appears only once the number proves demand as well as scarcity', () => {
    // 25 left of 50 means 25 real students paid. Worth showing on both counts.
    expect(mayShowSeatsLeft(25, 50)).toBe(true);
    expect(mayShowSeatsLeft(8, 50)).toBe(true);
    expect(mayShowSeatsLeft(1, 50)).toBe(true);
  });

  it('handles a campaign with no slots without dividing by zero', () => {
    expect(mayShowSeatsLeft(0, 0)).toBe(false);
  });

  it('holds for the campaign actually configured, whatever its size', () => {
    expect(mayShowSeatsLeft(CAMPAIGN.slots, CAMPAIGN.slots)).toBe(false);
  });
});

describe('every student-facing surface obeys the one rule', () => {
  const SURFACES = [
    'src/components/campaign/offer-card.tsx',
    'src/app/offer/page.tsx',
    'src/app/api/admin/campaign-push/route.ts',
  ];

  it('none of them prints a raw seat line ungated', () => {
    for (const f of SURFACES) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} must gate its seat count`).toContain('mayShowSeatsLeft');
      // The old shape: "{c.seatsLeft} of {c.slots} spots left".
      expect(src, `${f} still renders the of-N form`).not.toMatch(/seatsLeft\} of \{c\.slots\}/);
    }
  });

  it('no surface invents or inflates the number to make it showable', () => {
    for (const f of SURFACES) {
      const src = readFileSync(f, 'utf8');
      for (const fake of ['Math.min(', 'Math.max(3', '|| 12', '?? 12']) {
        expect(src, `${f} looks like it fudges the seat count`).not.toContain(`seatsLeft ${fake}`);
      }
    }
  });
});
