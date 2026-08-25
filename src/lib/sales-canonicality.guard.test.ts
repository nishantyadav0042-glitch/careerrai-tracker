import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveFocusSections } from './focus-sections';
import { scoreConversion, conversionTier, mockPercentiles } from './sales-score';
import { classifyLane } from './call-queue';
import { GOING_COLD_SILENT_DAYS, BROKEN_STREAK_MIN_RUN, NEW_LEAD_MAX_AGE_DAYS } from './os/scale-config';

// ── Phase 1.5 canonicality gate ─────────────────────────────────────────────
//
// Four debts this file exists to keep closed, found by auditing Phase 1 as
// hostilely as everything else (docs/SALES-INTELLIGENCE-ARCHITECTURE-GATE.md):
//
//   C0  mock_debriefs.varc/dilr/qa are JSONB ({percentile: n}), and the sales
//       360 rendered them straight into JSX — React refuses to render an
//       object, so the rep's page 500'd for any student who had ever logged a
//       mock. 3,124 tests passed because nothing rendered that page.
//   C1  the sales 360 derived its own weak/strong section from coverage math,
//       bypassing resolveFocusSections() — so a rep could tell a student
//       "your weak area is VARC" while the student's own plan said DILR.
//   C2  the conversion score was hand-copied into two files.
//   C3  classifyLane's thresholds were literals, overlapping older engines
//       with no shared definition of "silent".
//   C4  the reason for calling ("why") lived only on the queue card and
//       vanished when a rep opened the student directly.
//
// The rule this file encodes: SALES IS A READ SURFACE. It may present product
// truth; it may never compute a second version of it.

const CONV = readFileSync('src/lib/sales-conversion.ts', 'utf8');
const QUEUE = readFileSync('src/lib/call-queue.ts', 'utf8');
const PAGE = readFileSync('src/app/sales/student/[id]/page.tsx', 'utf8');

// ── C0 ──────────────────────────────────────────────────────────────────────
describe('C0 — a JSONB column can never reach JSX as an object', () => {
  it('mockPercentiles unwraps {percentile} into plain numbers', () => {
    const row = { taken_on: '2026-08-20', varc: { percentile: 80.77 }, dilr: { percentile: 46.79 }, qa: { percentile: 60.9 } };
    const p = mockPercentiles(row, 82.17);
    expect(p.varc).toBe(80.77);
    expect(p.dilr).toBe(46.79);
    expect(p.qa).toBe(60.9);
    expect(p.overall).toBe(82.17);
    for (const v of Object.values(p)) expect(typeof v === 'number' || v === null).toBe(true);
  });

  it('a missing or null percentile becomes null, never an empty object', () => {
    const p = mockPercentiles({ taken_on: '2026-08-23', varc: { percentile: null }, dilr: null, qa: undefined }, null);
    expect(p.varc).toBeNull();
    expect(p.dilr).toBeNull();
    expect(p.qa).toBeNull();
    expect(p.overall).toBeNull();
  });

  it('an out-of-range percentile is refused, not read aloud to a student', () => {
    // Production holds a real row with dilr {percentile: -2}. A rep must never
    // tell a student their percentile is negative; UNKNOWN beats a wrong fact.
    const p = mockPercentiles({ taken_on: '2026-08-23', varc: { percentile: 1 }, dilr: { percentile: -2 }, qa: { percentile: 101 } }, 3);
    expect(p.dilr).toBeNull();
    expect(p.qa).toBeNull();
    expect(p.varc).toBe(1); // 1 is a legal percentile
  });

  it('the view unwraps through the shared reader, never off the raw row', () => {
    // Encode the IDEA, not the characters: rendering {v.latestMock.varc} is
    // correct now BECAUSE the lib unwrapped it to a number. The defect was
    // assigning the raw JSONB column straight onto the view object
    // (`varc: m0.varc ?? null`), which is what put an object in front of JSX.
    expect(CONV).toContain('mockPercentiles(');
    for (const f of ['varc', 'dilr', 'qa']) {
      expect(CONV, `raw ${f} column assigned onto the view`).not.toMatch(new RegExp(`${f}:\\s*m0\\.${f}`));
    }
  });
});

// ── C1 ──────────────────────────────────────────────────────────────────────
describe('C1 — one weakness authority, shared with the student product', () => {
  it('sales resolves the weak section through the shared chain', () => {
    expect(CONV).toContain('resolveFocusSections(');
  });

  it('sales does not re-derive a weakest/strongest section of its own', () => {
    // The old inline derivation: reduce over section coverage percentages.
    expect(CONV).not.toMatch(/reduce\(\(a, b\) => \(b\.pct [<>] a\.pct \? b : a\)\)/);
    // And it must not re-implement the chain's lower rungs either.
    expect(CONV).not.toContain('weakestFromCoverage(');
    expect(CONV).not.toContain('weakestFromBaseline(');
  });

  it('the two surfaces CANNOT disagree: a mock outranks coverage for both', () => {
    // The divergence this guard exists to prevent, driven through the real
    // resolver: coverage says VARC is least covered, a recent mock says DILR
    // is weakest. The planner leads with DILR; sales must say DILR too.
    const coverageSaysVarc = [
      { section: 'VARC', status: 'not_started' }, { section: 'VARC', status: 'not_started' },
      { section: 'DILR', status: 'confident' }, { section: 'QA', status: 'confident' },
    ];
    const mockSaysDilr = [{ taken_on: '2026-08-20', varc: { percentile: 90 }, dilr: { percentile: 30 }, qa: { percentile: 70 } }];
    const focus = resolveFocusSections({}, coverageSaysVarc, mockSaysDilr, '2026-08-24');
    expect(focus.weakest).toBe('DILR');
    expect(focus.weakestSource).toBe('mock');
  });

  it('the rep is told WHICH rung the answer came from', () => {
    // "weak: DILR" from a mock and from a bare default are different claims.
    // A default is not a fact about the student (L1: UNKNOWN over a precise lie).
    expect(CONV).toContain('weakestSource');
    expect(PAGE).toContain('weakestSource');
  });
});

// ── C2 ──────────────────────────────────────────────────────────────────────
describe('C2 — one conversion score', () => {
  it('the score is a pure, shared function', () => {
    const s = scoreConversion({ momentumScore: 60, buddyTaps: 2, mockOpened: true, intentDoor: true, activeRecently: true });
    expect(s).toBe(Math.round(60 * 0.35) + 30 + 8 + 12 + 15);
  });

  it('tiers are decided in the same place as the score', () => {
    expect(conversionTier({ buddyTaps: 1, mockOpened: false, momentumScore: 10, activeRecently: true })).toBe('hot');
    expect(conversionTier({ buddyTaps: 1, mockOpened: false, momentumScore: 10, activeRecently: false })).toBe('warm');
    expect(conversionTier({ buddyTaps: 0, mockOpened: false, momentumScore: 10, activeRecently: false })).toBe('cool');
  });

  it('neither sales surface hand-copies the arithmetic', () => {
    for (const [name, src] of [['call-queue', QUEUE], ['sales-conversion', CONV]] as const) {
      expect(src, `${name} still computes the score inline`).not.toMatch(/\*\s*0\.35\)/);
      expect(src, `${name} does not import the shared score`).toContain('scoreConversion');
    }
  });
});

// ── C3 ──────────────────────────────────────────────────────────────────────
describe('C3 — one lane authority, thresholds in config', () => {
  it('lane thresholds live in scale-config, not as literals in the engine', () => {
    expect(QUEUE).toContain('GOING_COLD_SILENT_DAYS');
    expect(QUEUE).toContain('BROKEN_STREAK_MIN_RUN');
    expect(QUEUE).toContain('NEW_LEAD_MAX_AGE_DAYS');
  });

  it('classifyLane actually respects the configured thresholds', () => {
    const today = '2026-08-24';
    const daysAgo = (n: number) => new Date(Date.parse(today) - n * 86_400_000).toISOString().slice(0, 10);
    // A run one short of the configured minimum is not a broken streak.
    const short = classifyLane({
      todayIst: today, createdAt: null, buddyTaps: 0, intentDoor: false, momentumScore: 0,
      logDates: Array.from({ length: BROKEN_STREAK_MIN_RUN - 1 }, (_, i) => daysAgo(i + 1)),
    });
    expect(short.dueReason).not.toBe('broken_streak');
    // Exactly the minimum is.
    const atMin = classifyLane({
      todayIst: today, createdAt: null, buddyTaps: 0, intentDoor: false, momentumScore: 0,
      logDates: Array.from({ length: BROKEN_STREAK_MIN_RUN }, (_, i) => daysAgo(i + 1)),
    });
    expect(atMin.dueReason).toBe('broken_streak');
    // A signup older than the configured window has missed the activation lane.
    const stale = classifyLane({
      todayIst: today, createdAt: new Date(Date.parse(today) - (NEW_LEAD_MAX_AGE_DAYS + 1) * 86_400_000).toISOString(),
      logDates: [], buddyTaps: 0, intentDoor: false, momentumScore: 0,
    });
    expect(stale.dueReason).toBe('fresh');
    expect(GOING_COLD_SILENT_DAYS).toBeGreaterThan(0);
  });

  it('no second lane classifier exists anywhere in sales', () => {
    // The older engines (mission-queue root-cause census, momentum bands) do a
    // DIFFERENT job — a whole-roster census, not a per-student lane — and stay.
    // What must never appear is a rival per-student lane classifier.
    for (const f of ['src/lib/sales-conversion.ts', 'src/lib/sales-portfolio.ts', 'src/lib/sales-control-tower.ts']) {
      const s = readFileSync(f, 'utf8');
      expect(s, `${f} defines a rival lane classifier`).not.toMatch(/function classify(Lane|Bucket)/);
    }
  });
});

// ── C4 ──────────────────────────────────────────────────────────────────────
describe('C4 — the reason to call follows the student', () => {
  it('the 360 carries the same lane verdict as the queue card', () => {
    expect(CONV).toContain('classifyLane(');
    expect(PAGE).toContain('v.lane');
  });

  it("the student's own words reach the 360, not just the queue brief", () => {
    // pain_points is what the student typed at signup ("time management") —
    // the most quotable thing a rep has, and it died in the queue brief.
    expect(CONV).toContain('pain_points');
    expect(PAGE).toContain('painPoints');
  });
});
