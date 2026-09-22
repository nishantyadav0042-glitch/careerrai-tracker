import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  selectNoticeBatch, noticeComplete, priceNoticeContent,
  PRICE_NOTICE_DAILY_CAP, PRICE_NOTICE_TYPE, PRICE_REVISION_KEY,
} from './price-change-notice';
import { PLANS, SESSION_PRICING } from './plans';
import { hasDeclaredPolicy, policyFor } from './event-policy';

// ── A NOTICE, NOT A CAMPAIGN ────────────────────────────────────────────────
//
// Founder, 22 Sep 2026, on telling students the Till CAT price changed:
// "information symmetry, not a marketing campaign", and "only send
// notification for pricing day wise...not all pricing at once."
//
// Those two sentences are the whole specification, and these tests are what
// stop the next edit from quietly turning the notice into a promotion.

const ids = (n: number, prefix = 's') =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(5, '0')}`);

describe('day-wise: the rollout is bounded, resumable and tells nobody twice', () => {
  it('a batch never exceeds the daily cap', () => {
    expect(selectNoticeBatch({ candidateIds: ids(1_220), alreadyNotified: [] }))
      .toHaveLength(PRICE_NOTICE_DAILY_CAP);
  });

  it('students already told are never chosen again', () => {
    const all = ids(10);
    const batch = selectNoticeBatch({ candidateIds: all, alreadyNotified: all.slice(0, 7), cap: 10 });
    expect(batch).toEqual(all.slice(7));
  });

  it('running twice in one day selects the SAME people, not the next 200', () => {
    // The cron fires, the function is slow, the cron fires again. Without a
    // deterministic slice the second run would race ahead through the roster
    // and that day would notify 400 students instead of 200.
    const all = ids(1_220);
    const a = selectNoticeBatch({ candidateIds: all, alreadyNotified: [] });
    const b = selectNoticeBatch({ candidateIds: all, alreadyNotified: [] });
    expect(b).toEqual(a);
  });

  it('a run that dies halfway resumes exactly where it stopped', () => {
    const all = ids(500);
    const day1 = selectNoticeBatch({ candidateIds: all, alreadyNotified: [], cap: 200 });
    // Only 120 of the 200 actually got sent before the function died.
    const partial = day1.slice(0, 120);
    const day2 = selectNoticeBatch({ candidateIds: all, alreadyNotified: partial, cap: 200 });
    expect(day2.slice(0, 80)).toEqual(day1.slice(120));   // the unsent remainder, first
    expect(day2.some((id) => partial.includes(id))).toBe(false);
  });

  it('every student is told exactly once across the whole rollout', () => {
    // The end-to-end property, simulated: run the selection day after day and
    // assert the union is the population and nothing repeats.
    const all = ids(1_220);
    const told = new Set<string>();
    let days = 0;
    while (!noticeComplete(all, told)) {
      const batch = selectNoticeBatch({ candidateIds: all, alreadyNotified: told });
      expect(batch.length).toBeGreaterThan(0);          // always makes progress
      for (const id of batch) {
        expect(told.has(id), `${id} would be told twice`).toBe(false);
        told.add(id);
      }
      expect(++days).toBeLessThan(100);                 // terminates
    }
    expect(told.size).toBe(all.length);
    expect(days).toBe(Math.ceil(1_220 / PRICE_NOTICE_DAILY_CAP));
  });

  it('a duplicated id in the roster is one notification, not two', () => {
    expect(selectNoticeBatch({ candidateIds: ['a', 'a', 'b'], alreadyNotified: [], cap: 10 }))
      .toEqual(['a', 'b']);
  });

  it('cap 0 sends nothing — a pause is expressible without a code change', () => {
    expect(selectNoticeBatch({ candidateIds: ids(50), alreadyNotified: [], cap: 0 })).toEqual([]);
  });

  it('an empty roster is complete, and a full one is not', () => {
    expect(noticeComplete([], [])).toBe(true);
    expect(noticeComplete(['a'], [])).toBe(false);
    expect(noticeComplete(['a'], ['a'])).toBe(true);
  });
});

describe('the copy is a notice and cannot become a sell', () => {
  const { title, body, url } = priceNoticeContent();
  const text = `${title} ${body}`;

  it('states the CURRENT price, read from the authority', () => {
    expect(title).toContain(PLANS.tillcat.display);
    // And it is derived, not typed: the price must not appear as a literal in
    // the source. If it did, the next price change would leave it behind.
    const src = readFileSync('src/lib/price-change-notice.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(src).not.toContain(PLANS.tillcat.display);
    expect(src).not.toContain(String(PLANS.tillcat.offerPaise));
  });

  it('carries NO urgency — the founder refused it before being asked', () => {
    const urgency = /limited|hurry|last chance|expire|don'?t miss|act fast|ends (soon|today)|grab|buy now|book now|while it lasts|only for/i;
    expect(urgency.test(text), `urgency language in: ${text}`).toBe(false);
  });

  it('is not framed as an offer or a discount', () => {
    const sell = /\boffer\b|\bdiscount\b|\bdeal\b|\bsave ₹|\bsale\b|% off|cheaper|lowest/i;
    expect(sell.test(text), `promotional framing in: ${text}`).toBe(false);
  });

  it('states ONE price — the one that moved — not a price list', () => {
    // "not all pricing at once". Reciting every price to someone who did not
    // ask is a catalogue, and a catalogue is a campaign.
    expect(text).not.toContain(PLANS.monthly.display);
    expect(text).not.toContain(SESSION_PRICING.display);
    expect(text.match(/₹[\d,]+/g) ?? []).toEqual([PLANS.tillcat.display]);
  });

  it('never quotes the OLD price as an anchor', () => {
    for (const retired of ['₹2,599', '₹2,999', '₹3,999', '₹2,499']) {
      expect(text).not.toContain(retired);
    }
    // listDisplay is the struck-through anchor. A notice is not a pricing
    // card and has no business drawing one.
    expect(text).not.toContain(PLANS.tillcat.listDisplay);
  });

  it('leaks nothing internal — no incentive, no contract, no call queue', () => {
    const internal = /incentive|commission|₹200|engagement letter|counsellor|anshul|checkout_abandoned|call list|payroll/i;
    expect(internal.test(text), `internal detail in: ${text}`).toBe(false);
  });

  it('answers the one question a paying student will actually have', () => {
    // "What happens to what I already bought?" — answered in the notice, not
    // in a support conversation the next morning.
    expect(body.toLowerCase()).toMatch(/already paid|unaffected/);
  });

  it('points at the page that shows prices', () => {
    expect(url).toBe('/pricing');
  });
});

describe('the type is declared, and dedupe is keyed on the REVISION', () => {
  it('price_change has its own declared policy, not the silent default', () => {
    expect(hasDeclaredPolicy(PRICE_NOTICE_TYPE)).toBe(true);
    const p = policyFor(PRICE_NOTICE_TYPE);
    expect(p.taxonomy).toBe('commercial');   // it concerns what the product costs
    expect(p.ladder).toContain('push');
  });

  it('the runner dedupes on data->>revision, never on the type alone', () => {
    // Keying on the type would tell this student once and then silence every
    // FUTURE price change for them, permanently.
    const src = readFileSync('src/lib/price-change-notice.ts', 'utf8');
    expect(src).toContain("'data->>revision'");
    expect(src).toContain('data: { revision: PRICE_REVISION_KEY }');
  });

  it('the revision key names the change it belongs to', () => {
    expect(PRICE_REVISION_KEY).toMatch(/^tillcat-\d{4}-\d{2}-\d{2}$/);
  });
});
