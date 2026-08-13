import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyAttribution } from './attribution';

// ── The two ways this feature dies quietly ──────────────────────────────────
//
// Attribution is write-once at signup and read months later, when a budget
// decision is being made. Both failure modes below produce a dashboard that
// still renders confident numbers, which is why they need pinning rather than
// trusting to review.

const SIGNUP = 'src/app/api/auth/verify-phone-otp/route.ts';

describe('attribution is stamped on BOTH signup write paths', () => {
  // The signup route has two branches because a DB trigger can win the race
  // and create the profile row before this code looks. That exact asymmetry —
  // an insert that wrote more fields than the update beside it — already cost
  // 32 students their name and phone number. A field that only lands when the
  // timing is lucky looks like "some traffic is untagged" forever.
  it('both the insert and the stub-update branch write the attribution columns', () => {
    const src = readFileSync(SIGNUP, 'utf8');
    const spreads = (src.match(/attrColumns/g) ?? []).length;
    // One declaration + one use in each of the two branches.
    expect(spreads).toBeGreaterThanOrEqual(3);
  });

  it('the cookie is read from the request, never trusted from a client body', () => {
    const src = readFileSync(SIGNUP, 'utf8');
    expect(src).toContain("request.cookies.get('cr_attr')");
  });
});

describe('click ids survive storage intact', () => {
  // gclid/fbclid are opaque and case-sensitive. Normalising them the way utm
  // tags are normalised destroys them, and the loss is undetectable until the
  // day they are uploaded back to Google to prove which clicks converted.
  it('preserves click-id case while still lowercasing utm tags', () => {
    const a = classifyAttribution({ gclid: 'CjwKCAjw_AbCdEf', utm_source: 'GOOGLE' });
    expect(a.clickId).toBe('CjwKCAjw_AbCdEf');
    expect(a.source).toBe('google');
  });

  it('preserves fbclid case too', () => {
    const a = classifyAttribution({ fbclid: 'IwAR2xYzQ' });
    expect(a.clickId).toBe('IwAR2xYzQ');
  });
});

describe('the admin readout separates "not measured" from "no ad"', () => {
  // Folding rows that predate attribution into the direct bucket would turn
  // "we weren't measuring yet" into "these people came direct" — a number that
  // survives into a budget decision precisely because it looks like data.
  it('the growth page counts untracked rows separately from the direct channel', () => {
    const src = readFileSync('src/app/admin/growth/page.tsx', 'utf8');
    expect(src).toContain('attr_stamped_at');
    expect(src).toContain('untracked');
  });
});
