import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { REASON_CATEGORIES, reasonNeedsVerbatim } from './intervention-taxonomy';

// ── THE TAXONOMY MUST BE REACHABLE FROM THE SURFACE THAT IS ACTUALLY USED ──
//
// Founder, 30 Aug 2026: "What feedback are counsellors naturally seeing that
// the founder currently cannot see?" On 29 Aug the answer was: all of it.
//
// reason_category was captured on /sales/student/[id] and NOT in the call deck
// — and the call deck IS the working day. A counsellor works the queue and
// disposes each card; nobody opens sixty student pages to add a category. So
// every call made through the real workflow wrote NULL, and the ledger column,
// the taxonomy and the founder's product-intelligence view were all being fed
// by a surface nobody used.
//
// A capability that exists only on a page the user never visits does not exist.

const deck = readFileSync('src/components/call-deck.tsx', 'utf8');
const quicklog = readFileSync('src/components/sales-log.tsx', 'utf8');
const api = readFileSync('src/app/api/sales/log/route.ts', 'utf8');

describe('the queue captures what the student said', () => {
  it('the call deck SENDS reasonCategory to the API', () => {
    expect(deck, 'the primary calling surface must send the reason, not just the student page')
      .toMatch(/reasonCategory:/);
  });

  it('and sends the verbatim alongside it', () => {
    expect(deck).toMatch(/reasonVerbatim:/);
  });

  it('it offers the real taxonomy, not a hand-copied list', () => {
    expect(deck, 'a second copy of the vocabulary would drift from the first')
      .toMatch(/from '@\/lib\/intervention-taxonomy'/);
    expect(deck).toMatch(/REASON_CATEGORIES\.map/);
  });

  it('both disposition surfaces feed the same field', () => {
    for (const [name, src] of [['call-deck', deck], ['sales-log', quicklog]] as const) {
      expect(src, `${name} must contribute to the same learning record`).toMatch(/reasonCategory/);
    }
  });

  it('the API it posts to actually reads the field', () => {
    expect(api).toMatch(/reasonCategory/);
    expect(api).toMatch(/isReasonCategory/);
  });
});

describe('capturing it cannot become a chore', () => {
  // Feedback is a by-product of the work. Forcing a category on every one of
  // sixty calls produces whatever sits at the top of the list — data-shaped
  // noise, which is worse than an honest NULL.
  it('the reason is optional', () => {
    expect(deck, 'the picker must offer an empty choice').toMatch(/<option value="">/);
    expect(deck, 'saving must not be gated on picking a reason')
      .not.toMatch(/canSave\s*=[^;]*reason\s*(!==|===)\s*''/);
  });

  it('but `other` still demands the verbatim the API requires', () => {
    // Without this the rep taps Save, the API rejects it, and the card sits
    // there with no explanation.
    expect(deck).toMatch(/needsVerbatim/);
    expect(deck).toMatch(/reasonVerbatim\.trim\(\)\.length >= 3/);
    expect(reasonNeedsVerbatim('other')).toBe(true);
  });

  it('an unanswered call is never asked why the student is not studying', () => {
    // Nobody spoke to them. Asking would be inviting the rep to guess, and a
    // guessed category is indistinguishable from an observed one once stored.
    expect(deck).toMatch(/asksReason\s*=\s*outcome !== 'no_answer'/);
  });

  it('the vocabulary still carries the product-fixable causes', () => {
    for (const r of ['coaching_timetable_conflict', 'app_confusing', 'price', 'wanted_mentor']) {
      expect(REASON_CATEGORIES).toContain(r);
    }
  });
});
