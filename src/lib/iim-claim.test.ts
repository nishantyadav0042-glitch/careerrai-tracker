import { describe, it, expect } from 'vitest';
import { canClaimIim, mentorCredential, buddyCtaLabel } from '@/lib/iim-claim';

const verified = { iim_converted: 'IIM Bangalore', iim_verified_at: '2026-08-19T00:00:00Z', cat_percentile: '99' };
const unverified = { iim_converted: 'IIM Bangalore', iim_verified_at: null, cat_percentile: '99' };
const noIim = { iim_converted: null, iim_verified_at: null, cat_percentile: '99' };

describe('canClaimIim', () => {
  it('allows the claim only when verified AND named', () => {
    expect(canClaimIim(verified)).toBe(true);
  });

  it('refuses a self-reported IIM with no verification', () => {
    // This is production's current state for all 8 buddies.
    expect(canClaimIim(unverified)).toBe(false);
  });

  it('refuses a verification timestamp with no institute named', () => {
    expect(canClaimIim({ iim_converted: null, iim_verified_at: '2026-08-19T00:00:00Z' })).toBe(false);
    expect(canClaimIim({ iim_converted: '   ', iim_verified_at: '2026-08-19T00:00:00Z' })).toBe(false);
  });

  it('refuses missing input rather than assuming', () => {
    expect(canClaimIim(null)).toBe(false);
    expect(canClaimIim(undefined)).toBe(false);
    expect(canClaimIim({})).toBe(false);
  });
});

describe('mentorCredential', () => {
  it('names the IIM once verified', () => {
    expect(mentorCredential(verified)).toBe('IIM Bangalore');
  });

  it('falls back to the percentile, never the institute, when unverified', () => {
    const out = mentorCredential(unverified);
    expect(out).toBe('99 percentile in CAT');
    expect(out).not.toMatch(/IIM/);
  });

  it('uses the percentile for a mentor with no IIM at all', () => {
    // One real buddy has 99 percentile and no IIM listed.
    expect(mentorCredential(noIim)).toBe('99 percentile in CAT');
  });

  it('returns null rather than inventing a credential', () => {
    expect(mentorCredential({ iim_converted: null, cat_percentile: null })).toBeNull();
    expect(mentorCredential({ cat_percentile: '  ' })).toBeNull();
  });
});

describe('buddyCtaLabel', () => {
  it('claims IIM only when someone on screen can carry it', () => {
    expect(buddyCtaLabel([verified, unverified])).toBe('Talk to an IIM Buddy');
  });

  it('drops to the plain label when nobody is verified', () => {
    // Today's production answer for every mentor.
    expect(buddyCtaLabel([unverified, noIim])).toBe('Talk to a Buddy');
    expect(buddyCtaLabel([])).toBe('Talk to a Buddy');
  });

  it('never says "book" or "hire" — the founder ruled on the register', () => {
    for (const label of [buddyCtaLabel([verified]), buddyCtaLabel([])]) {
      expect(label).toMatch(/^Talk to/);
      expect(label).not.toMatch(/book|hire|buy|mentorship/i);
    }
  });
});
