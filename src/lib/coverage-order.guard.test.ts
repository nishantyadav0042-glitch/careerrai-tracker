import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── A question that is asked must be answered by the next screen ────────────
//
// The defect a student found on 22 Aug was not a typo. Both funnels asked
// "which section costs you the most marks?" and then chose the next screen's
// section from a constant. These pin the INVARIANT — the grid's order is
// derived from the student's answer — rather than the shape of any one fix.

const START = readFileSync('src/app/start/page.tsx', 'utf8');
const MODAL = readFileSync('src/app/student/onboarding/onboarding-modal.tsx', 'utf8');

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('neither funnel hardcodes which section comes first', () => {
  it('no literal section order array survives in either file', () => {
    for (const src of [strip(START), strip(MODAL)]) {
      // e.g. ['DILR', 'VARC', 'QA', ...] — the exact shape that caused this.
      expect(src).not.toMatch(/\[\s*'(VARC|DILR|QA)'\s*,\s*'(VARC|DILR|QA)'\s*,/);
    }
  });

  it('both derive the order from the student answer', () => {
    for (const src of [strip(START), strip(MODAL)]) {
      expect(src).toMatch(/sectionOrder[=:]\s*\{?\s*coverageOrderFor\(/);
      expect(src).toMatch(/coverageOrderFor\([^)]*self_reported_weakest_section/);
    }
  });
});

describe('the grid can never resume a sequence built for a different answer', () => {
  it('both funnels key the coverage draft to the answer', () => {
    for (const src of [strip(START), strip(MODAL)]) {
      expect(src).toMatch(/coverageDraftKey\(/);
    }
  });

  it('the pre-auth funnel no longer falls back to a device-global draft key', () => {
    // Without an explicit key the component uses one global string, which is
    // how a shared hostel phone resumed a stranger's half-finished grid.
    expect(strip(START)).toMatch(/draftKey=\{coverageDraftKey\(/);
  });
});

describe('the weakest-section answer still reaches the grid at all', () => {
  it('the funnels read the field the weakest-section screen actually writes', () => {
    // The screen writes self_reported_weakest_section. An earlier reader in
    // the modal used a legacy `weakest_section` key that is never populated —
    // reading the wrong field is how an answer silently becomes a default.
    expect(strip(START)).toContain('self_reported_weakest_section');
    expect(strip(MODAL)).toContain('self_reported_weakest_section');
  });
});
