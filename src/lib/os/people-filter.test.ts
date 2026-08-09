import { describe, it, expect } from 'vitest';
import {
  deriveSubscription, deriveBuddy, deriveActivity, toPersonRow,
  applyFilter, matches, parseFilter, toggledHref, SUB_META, type PersonFacts,
} from './people-filter';

const base: PersonFacts = {
  isPremium: false, subscriptionStatus: 'free_beta', hasPaymentPending: false,
  hasPaymentFailed: false, hasBuddy: false, wantsBuddy: false, paymentStuck: false,
  hasPlan: false, daysSinceLog: null,
};

describe('honest subscription states — never "Free beta"', () => {
  it('derives the right state from clear rules', () => {
    expect(deriveSubscription({ ...base, isPremium: true })).toBe('premium');
    expect(deriveSubscription({ ...base, hasPaymentPending: true })).toBe('payment_pending');
    expect(deriveSubscription({ ...base, hasPaymentFailed: true })).toBe('payment_failed');
    expect(deriveSubscription({ ...base, subscriptionStatus: 'expired' })).toBe('expired');
    expect(deriveSubscription(base)).toBe('free');
  });
  it('never labels anything "Free beta"', () => {
    for (const m of Object.values(SUB_META)) {
      expect(m.label.toLowerCase()).not.toContain('beta');
    }
  });
});

describe('buddy state — "wants" is a free-tier signal only', () => {
  it('a free student who wants a mentor is "wants"', () => {
    expect(deriveBuddy({ ...base, wantsBuddy: true })).toBe('wants');
  });
  it('a premium student with no buddy is "none" (an unassigned fault, not a lead)', () => {
    // This is what makes sub=premium&buddy=none reproduce the sacred/inbox set
    // exactly — a premium student who once tapped the CTA must not hide here.
    expect(deriveBuddy({ ...base, isPremium: true, wantsBuddy: true })).toBe('none');
  });
  it('any student with a buddy is "assigned"', () => {
    expect(deriveBuddy({ ...base, hasBuddy: true, wantsBuddy: true })).toBe('assigned');
  });
});

describe('activity states from days since last log', () => {
  it('maps the day distance to a founder word', () => {
    expect(deriveActivity(0)).toBe('today');
    expect(deriveActivity(1)).toBe('yesterday');
    expect(deriveActivity(3)).toBe('this_week');       // 2-3 days: recent
    expect(deriveActivity(4)).toBe('going_cold');       // unified threshold (GOING_COLD_DAYS = 4)
    expect(deriveActivity(9)).toBe('going_cold');
    expect(deriveActivity(null)).toBe('inactive');
  });
});

describe('filters COMBINE — the whole point', () => {
  const premActiveWantsBuddy = toPersonRow('1', 'A', null, {
    ...base, isPremium: true, wantsBuddy: true, daysSinceLog: 1,
  });
  const freeColdNoBuddy = toPersonRow('2', 'B', null, { ...base, daysSinceLog: 10 });

  it('Premium + Active yesterday narrows to exactly the intersection', () => {
    const rows = [premActiveWantsBuddy, freeColdNoBuddy];
    expect(applyFilter(rows, { sub: 'premium', activity: 'yesterday' }).map((r) => r.id)).toEqual(['1']);
    expect(applyFilter(rows, { sub: 'free' }).map((r) => r.id)).toEqual(['2']);
  });

  it('an empty filter returns everyone', () => {
    const rows = [premActiveWantsBuddy, freeColdNoBuddy];
    expect(applyFilter(rows, {}).length).toBe(2);
  });

  it('a three-dimension combine works (Premium + buddy assigned + yesterday)', () => {
    const r = toPersonRow('3', 'C', null, { ...base, isPremium: true, hasBuddy: true, daysSinceLog: 1 });
    expect(matches(r, { sub: 'premium', buddy: 'assigned', activity: 'yesterday' })).toBe(true);
    expect(matches(r, { sub: 'premium', buddy: 'none', activity: 'yesterday' })).toBe(false);
  });
});

describe('default sort is business priority, never alphabetical', () => {
  it('a P0 sorts above a P3 even if the name comes later', () => {
    const zulu_p0 = toPersonRow('z', 'Zulu', null, { ...base, isPremium: true, hasBuddy: false }); // premium no buddy = P0
    const alpha_p3 = toPersonRow('a', 'Alpha', null, { ...base, isPremium: true, hasBuddy: true }); // P3
    const out = applyFilter([alpha_p3, zulu_p0], {});
    expect(out[0].name).toBe('Zulu'); // P0 first, not "Alpha"
  });
});

describe('URL filter round-trips — the honest saved view', () => {
  it('parses only valid values', () => {
    expect(parseFilter({ sub: 'premium', activity: 'yesterday' })).toEqual({ sub: 'premium', buddy: undefined, activity: 'yesterday' });
    expect(parseFilter({ sub: 'nonsense' })).toEqual({ sub: undefined, buddy: undefined, activity: undefined });
  });
  it('toggling a value on and off', () => {
    expect(toggledHref('/admin/people', {}, 'sub', 'premium')).toBe('/admin/people?sub=premium');
    expect(toggledHref('/admin/people', { sub: 'premium' }, 'sub', 'premium')).toBe('/admin/people');
    expect(toggledHref('/admin/people', { sub: 'premium' }, 'activity', 'today')).toContain('sub=premium');
    expect(toggledHref('/admin/people', { sub: 'premium' }, 'activity', 'today')).toContain('activity=today');
  });
});

describe('the Command Center never shows a dead door', () => {
  it('revenue tiles hide when their count is zero', () => {
    const page = readFileSync('src/app/admin/page.tsx', 'utf8');
    expect(page).toContain('.filter((t) => t.value > 0)');
    expect(page).toContain('if (tiles.length === 0) return null');
  });
  it('revenue tiles route into the EXACT set behind each count', () => {
    const page = readFileSync('src/app/admin/page.tsx', 'utf8');
    // buddy=wants (no extra sub filter) matches the getWantsBuddy count exactly.
    expect(page).toContain('/admin/people?buddy=wants');
    // premium+no-buddy is a real People filter that reproduces the sacred set.
    expect(page).toContain('/admin/people?sub=premium&buddy=none');
    // Captured-not-unlocked students derive as sub=free, so the tile must NOT
    // send the founder to payment_failed (a different population); it opens the
    // Revenue Operations captured-not-unlocked list, the exact set + the fix.
    expect(page).toContain('/admin/revenue?state=captured_not_unlocked');
    expect(page).not.toContain('/admin/people?sub=payment_failed');
  });
});
import { readFileSync } from 'node:fs';
