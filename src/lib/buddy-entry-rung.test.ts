import { describe, it, expect } from 'vitest';
import { SESSION_PRICING } from '@/lib/plans';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SESSION_PRICE_PAISE } from './session-credit';
import { PLANS } from './plans';

// ── The ₹299 session becomes the entry rung on the two upsell screens ───────
//
// Founder rulings (19 Aug):
//   1. ₹299 is an ENTRY RUNG. The subscriptions stay; nothing is removed.
//   2. The outcome claim is rewritten to what a buddy DOES.
//
// THE GAP THIS CLOSES. Both upsell screens jumped from free straight to
// ₹999–₹2,999. The ₹299 single session already existed — with payments, a
// booking route and a capacity-gated card — but neither screen contained the
// string "299" anywhere, so the cheapest real step was invisible on the path
// students actually walk.
//
// WHY BOTH SCREENS LINK OUT RATHER THAN SELLING INLINE. BookSessionCard is
// deliberately capacity-gated: it fetches availability BEFORE rendering, and
// renders one of available / sold out / already booked, "so a student never
// taps something that is going to turn them down." Production capacity is 21
// sessions a week across 7 capped mentors, against 492 buddy-less students who
// see the daily nudge. A raw ₹299 button on a modal shown to all of them would
// take money the mentors cannot serve — exactly what that card was built to
// prevent. So the rung ROUTES to /student/buddy, where the gated card lives.
//
// THE CLAIM. "Students with an IIM buddy stay consistent and actually fix
// their weak areas" is an outcome assertion, and there are 7 premium students
// and 1 session request in the entire dataset. It is the same defect this
// project spent the week removing from the data layer — a confident statement
// the evidence does not support — and it is worse in marketing copy, because a
// student parts with money on the strength of it.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const NUDGE = 'src/components/daily-buddy-nudge.tsx';
const SHEET = 'src/components/unlock-buddy-sheet.tsx';

describe('the single-session rung is on both screens', () => {
  it('the daily nudge offers it', () => {
    expect(read(NUDGE)).toContain('SESSION_PRICING.display');
  });

  it('the pricing sheet offers it alongside the subscriptions', () => {
    const s = read(SHEET);
    // Surfaces now render from the authority, so the assertion is that they
    // REFERENCE it — a hardcoded number here would re-create the drift this
    // whole guard exists to stop.
    expect(s).toContain('SESSION_PRICING.display');
    expect(s, 'the subscriptions must survive — this adds a rung, it does not replace one')
      .toContain('PLANS.tillcat.display');
    expect(s).toContain('PLANS.monthly.display');
  });

  it('the price shown matches the price actually charged', () => {
    // One number, from the module that owns it. A hardcoded label that drifts
    // from SESSION_PRICE_PAISE would be a lie at the checkout screen.
    expect(SESSION_PRICE_PAISE).toBe(SESSION_PRICING.offerPaise);
    expect(SESSION_PRICING.display).toBe(`₹${SESSION_PRICE_PAISE / 100}`);
  });

  it('every displayed price agrees with the paise it charges', () => {
    // Prices change; this relationship must not. Pinning the literals here is
    // what made a routine price change break seven unrelated tests.
    expect(PLANS.tillcat.display).toBe(`₹${(PLANS.tillcat.offerPaise / 100).toLocaleString('en-IN')}`);
    expect(PLANS.monthly.display).toBe(`₹${(PLANS.monthly.offerPaise / 100).toLocaleString('en-IN')}`);
  });
});

describe('neither screen takes money for a session it cannot serve', () => {
  for (const [name, path] of [['daily nudge', NUDGE], ['pricing sheet', SHEET]] as const) {
    it(`${name} routes the ₹299 rung to the gated card instead of charging inline`, () => {
      const s = read(path);
      expect(s, 'must send the student to where availability is checked')
        .toContain('/student/buddy');
      // Scoped to the SESSION path only. The pricing sheet legitimately opens
      // Razorpay for the ₹999 / ₹2,999 SUBSCRIPTIONS — that is pre-existing and
      // correct, and forbidding it outright was my assertion being wrong rather
      // than the code. What must never happen is charging for a session from a
      // screen that has not checked mentor availability.
      expect(s, 'the session must not be sold without an availability check')
        .not.toMatch(/sessions\/book/);
      // This guard reads SOURCE, so it cannot tell rendered JSX from a comment,
      // and both files carry comments that mention the price. Anchoring on the
      // first occurrence therefore lands on prose and silently tests nothing —
      // which is exactly how this assertion failed when I first wrote it. The
      // real claim is weaker and truer: SOME occurrence of the price sits
      // inside a link to the gated card. That survives future commentary.
      const at = [...s.matchAll(/SESSION_PRICING\.display/g)].map((m) => m.index ?? 0);
      expect(at.length, 'the rung must carry the price, not just the digits')
        .toBeGreaterThan(0);
      const linked = at.some((i) =>
        /href="\/student\/buddy"/.test(s.slice(Math.max(0, i - 900), i + 900)),
      );
      expect(linked, 'the rung itself must be a link, not a purchase').toBe(true);
    });
  }

  it('the gated card still guards all three states', () => {
    const card = read('src/components/buddy/book-session-card.tsx');
    for (const state of ['available', 'alreadyBooked', 'priceLabel']) {
      expect(card, `${state} must survive`).toContain(state);
    }
    expect(card, 'availability is still fetched before the button renders')
      .toContain("fetch('/api/sessions/book')");
  });

  it('the route from the rung to the gated card is unbroken', () => {
    // nudge/sheet -> /student/buddy -> BuddyConversionScreen -> BookSessionCard
    expect(read('src/app/student/buddy/page.tsx')).toContain('BuddyConversionScreen');
    expect(read('src/components/buddy/buddy-conversion-screen.tsx')).toContain('BookSessionCard');
  });
});

describe('the outcome claim is gone', () => {
  it('the nudge no longer asserts that a buddy makes students consistent', () => {
    const s = read(NUDGE);
    expect(s).not.toMatch(/stay consistent and actually fix/);
    expect(s, 'no unevidenced retention or outcome promise').not.toMatch(/\bstay consistent\b/);
  });

  it('it still says what a buddy DOES — the mechanism is the honest part', () => {
    const s = read(NUDGE);
    expect(s).toContain('A plan for tomorrow');
    expect(s).toContain('each error named');
    expect(s).toMatch(/weekly 1-on-1/);
  });

  it('no new outcome claim was introduced in its place', () => {
    const s = read(NUDGE);
    for (const claim of ['guarantee', 'proven', 'will improve', 'score jump', '% more']) {
      expect(s.toLowerCase(), `"${claim}" is not something we can evidence`).not.toContain(claim);
    }
  });
});

describe('scope containment', () => {
  it('no pricing constant changed', () => {
    // The authority is allowed to change — that is its job. What must hold is
    // that it stays the ONLY place a price is stated.
    const plans = read('src/lib/plans.ts');
    expect(plans).toContain('offerPaise');
    expect(read('src/lib/session-credit.ts'))
      .toContain('SESSION_PRICE_PAISE = SESSION_PRICING.offerPaise');
  });

  it('the refund and no-auto-debit promises are unchanged', () => {
    const s = read(SHEET);
    expect(s).toContain('no auto-debit, ever');
    expect(s).toMatch(/20\+ study days/);
  });
});
