import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mockInformedFocus, MIN_GAP, MAX_DEBRIEF_AGE_DAYS } from './mock-informed-focus';

// The plan's focus is the single highest-leverage output of the whole
// pipeline — every task list starts from it. These tests pin when a mock may
// take that wheel and, just as important, when it must keep its hands off.

const TODAY = '2026-08-13';
const d = (takenOn: string, varc: number | null, dilr: number | null, qa: number | null) => ({
  taken_on: takenOn,
  varc: varc == null ? null : { percentile: varc },
  dilr: dilr == null ? null : { percentile: dilr },
  qa: qa == null ? null : { percentile: qa },
});

describe('a recent complete decisive mock steers the plan', () => {
  it('the founder\'s own case: VARC 89, DILR 99, QA 99 → VARC focus', () => {
    const f = mockInformedFocus([d('2026-08-13', 89, 99, 99)], TODAY);
    expect(f?.weakest).toBe('VARC');
    expect(f?.strongest).toBe('QA');
    expect(f?.basis).toContain('VARC 89');
    expect(f?.basis).toContain('VARC needs the work');
  });

  it('uses the most recent complete debrief, not an older one', () => {
    const f = mockInformedFocus([
      d('2026-08-10', 60, 95, 95),
      d('2026-07-20', 95, 95, 60),
    ], TODAY);
    expect(f?.weakest).toBe('VARC');
    expect(f?.takenOn).toBe('2026-08-10');
  });
});

describe('when the mock must keep its hands off the wheel', () => {
  it('no debriefs at all', () => {
    expect(mockInformedFocus([], TODAY)).toBeNull();
  });

  it('an incomplete mock ranks nothing — but an older complete one still counts', () => {
    const f = mockInformedFocus([
      d('2026-08-12', null, 99, 99),
      d('2026-08-01', 70, 95, 95),
    ], TODAY);
    expect(f?.takenOn).toBe('2026-08-01');
    expect(f?.weakest).toBe('VARC');
  });

  it('a stale mock says nothing about who the student is now', () => {
    expect(mockInformedFocus([d('2026-06-01', 50, 99, 99)], TODAY)).toBeNull();
    // Boundary: exactly at the window edge still counts.
    const edge = new Date(new Date(`${TODAY}T00:00:00Z`).getTime() - MAX_DEBRIEF_AGE_DAYS * 86_400_000)
      .toISOString().slice(0, 10);
    expect(mockInformedFocus([d(edge, 50, 99, 99)], TODAY)).not.toBeNull();
  });

  it('a near-tie is noise, not a signal — the rest of the chain decides', () => {
    expect(mockInformedFocus([d('2026-08-13', 90, 90 + MIN_GAP - 1, 99)], TODAY)).toBeNull();
    expect(mockInformedFocus([d('2026-08-13', 90, 90 + MIN_GAP, 99)], TODAY)).not.toBeNull();
  });

  it('an indecisive LATEST mock is final — it does not fall through to an older decisive one', () => {
    // The newest complete evidence says "no clear weakness"; reaching past it
    // to an older mock would prefer stale evidence over fresh.
    const f = mockInformedFocus([
      d('2026-08-12', 90, 91, 92),
      d('2026-08-01', 50, 95, 95),
    ], TODAY);
    expect(f).toBeNull();
  });

  it('a future-dated row (clock skew, bad entry) is ignored', () => {
    expect(mockInformedFocus([d('2026-09-01', 50, 99, 99)], TODAY)).toBeNull();
  });

  it('garbage percentiles disqualify the row rather than ranking on them', () => {
    expect(mockInformedFocus([d('2026-08-13', -5, 99, 99)], TODAY)).toBeNull();
    expect(mockInformedFocus([d('2026-08-13', 890, 99, 99)], TODAY)).toBeNull();
  });
});

describe('the override is wired in and SAID, never silent', () => {
  const route = () => readFileSync('src/app/api/routine/today/route.ts', 'utf8');

  it('measured focus outranks the self-report in the chain', () => {
    // Evidence beats memory: the mock override sits ABOVE self_reported in
    // the weakest chain.
    const src = route();
    const mockIdx = src.indexOf('mockFocus?.weakest');
    const selfIdx = src.indexOf('profile.self_reported_weakest_section as Section');
    expect(mockIdx, 'mock override missing from the chain').toBeGreaterThan(-1);
    expect(mockIdx).toBeLessThan(selfIdx);
  });

  it('the basis line reaches the response, so the student sees WHY focus moved', () => {
    expect(route()).toContain('focusBasis');
  });
});
