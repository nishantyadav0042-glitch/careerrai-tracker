import { describe, it, expect } from 'vitest';
import { computePrepInsight, discoverySection, type MatrixEntry } from './prep-insight-engine';
import { TOPIC_METADATA, MOCK_PREP_UNITS, READING_HABIT_UNITS } from './topics-constants';

// ── Preparation Insight Engine — self-report, saturation guard, foundation
// gate, and the four real-production regression cases (15 Aug) ─────────────
//
// The original bug: self_reported_weakest_section was collected and
// persisted correctly but never reached computePrepInsight, so a student who
// said "VARC" could see an unrelated, unacknowledged QA finding as the hero
// card. Fixed by: (1) the engine now accepts the self-report and ALWAYS
// echoes it back (selfReportedWeakestSection/selfReportStatus on the
// result), so the render layer can never silently drop it; (2) a Validation/
// Discovery split — a real finding IN the self-reported section always wins
// primary when one exists, never merely "one candidate among many that can
// lose"; (3) a saturation guard, proven necessary by a real production
// finding: 8 of 34 real students had all three sections at >=0.95 gap, and
// the OLD DILR->QA->VARC tie-break resolved every one of them to DILR —
// including real self-reporters, a false contradiction of what they'd just
// told us.
//
// The four regression fixtures below are REAL production topic_coverage
// data (student IDs truncated to 8 chars, pseudonymous primary keys, not
// names/phone/email), pulled read-only during the investigation that found
// this bug. Used here as a software-correctness corpus, per the explicit
// standing instruction in this investigation: NEVER as a population/
// distribution estimate.

const TODAY = new Date('2026-08-15T00:00:00.000Z');

function fullMatrix(overrides: Record<string, MatrixEntry['status']>): MatrixEntry[] {
  const topics: MatrixEntry[] = Object.entries(TOPIC_METADATA).map(([topic, meta]) => ({
    section: meta.section, topic, status: overrides[topic] ?? 'not_started',
  }));
  const habits: MatrixEntry[] = [
    ...MOCK_PREP_UNITS.map((t) => ({ section: 'MOCKS', topic: t, status: overrides[t] ?? ('not_started' as const) })),
    ...READING_HABIT_UNITS.map((t) => ({ section: 'READING', topic: t, status: overrides[t] ?? ('not_started' as const) })),
  ];
  return [...topics, ...habits];
}

const BASE = {
  ambitionDate: null as string | null, selfStudyHours: null as number | null,
  isRepeater: null as boolean | null, lastYearPercentile: null as number | null, today: TODAY,
};

// Real production matrices, student_id prefixes as comments.
const FEA4A910: Record<string, MatrixEntry['status']> = {
  'Arrangements': 'not_started', 'Binary Logic': 'practicing', 'Caselets': 'practicing', 'Charts': 'learning',
  'Games & Tournaments': 'revising', 'Hybrid DILR Sets': 'practicing', 'Selection & Distribution': 'not_started',
  'Tables': 'learning', 'Venn / Sets': 'learning', 'Average': 'learning', 'Base System': 'not_started',
  'Circles': 'not_started', 'Coordinate Geometry': 'not_started', 'Divisibility': 'learning', 'Functions': 'revising',
  'HCF & LCM': 'not_started', 'Inequalities': 'not_started', 'Linear Equations': 'not_started', 'Lines & Angles': 'revising',
  'Logarithms': 'not_started', 'Mensuration': 'learning', 'Mixtures': 'not_started', 'Percentages': 'practicing',
  'Permutation & Combination': 'learning', 'Pipes & Cisterns': 'not_started', 'Probability': 'learning',
  'Profit & Loss': 'learning', 'Progressions': 'not_started', 'Quadratic Equations': 'not_started', 'Quadrilaterals': 'learning',
  'Ratio & Proportion': 'practicing', 'Remainders': 'practicing', 'SI & CI': 'not_started', 'Set Theory': 'not_started',
  'Time & Work': 'practicing', 'Time Speed Distance': 'learning', 'Triangles': 'learning', 'Editorial Reading': 'practicing',
  'Grammar': 'practicing', 'Odd One Out': 'not_started', 'Para Jumbles': 'not_started', 'Para Summary': 'learning',
  'Reading Comprehension': 'practicing', 'Reading Speed Practice': 'learning', 'Sentence Completion': 'practicing', 'Vocabulary': 'learning',
};
const EIGHT_AC: Record<string, MatrixEntry['status']> = {
  'Arrangements': 'learning', 'Binary Logic': 'not_started', 'Caselets': 'not_started', 'Charts': 'not_started',
  'Games & Tournaments': 'not_started', 'Hybrid DILR Sets': 'not_started', 'Selection & Distribution': 'not_started',
  'Tables': 'learning', 'Venn / Sets': 'not_started', 'Average': 'learning', 'Base System': 'not_started', 'Circles': 'learning',
  'Coordinate Geometry': 'learning', 'Divisibility': 'learning', 'Functions': 'learning', 'HCF & LCM': 'not_started',
  'Inequalities': 'learning', 'Linear Equations': 'learning', 'Lines & Angles': 'learning', 'Logarithms': 'not_started',
  'Mensuration': 'learning', 'Mixtures': 'not_started', 'Percentages': 'not_started', 'Permutation & Combination': 'learning',
  'Pipes & Cisterns': 'not_started', 'Probability': 'learning', 'Profit & Loss': 'not_started', 'Progressions': 'practicing',
  'Quadratic Equations': 'learning', 'Quadrilaterals': 'learning', 'Ratio & Proportion': 'not_started', 'Remainders': 'learning',
  'SI & CI': 'practicing', 'Set Theory': 'not_started', 'Time & Work': 'learning', 'Time Speed Distance': 'learning',
  'Triangles': 'learning', 'Editorial Reading': 'learning', 'Grammar': 'learning', 'Odd One Out': 'learning',
  'Para Jumbles': 'learning', 'Para Summary': 'practicing', 'Reading Comprehension': 'practicing', 'Reading Speed Practice': 'practicing',
  'Sentence Completion': 'learning', 'Vocabulary': 'learning',
};
const A4A286C2: Record<string, MatrixEntry['status']> = {
  'Arrangements': 'learning', 'Binary Logic': 'learning', 'Caselets': 'not_started', 'Charts': 'not_started',
  'Games & Tournaments': 'learning', 'Hybrid DILR Sets': 'learning', 'Selection & Distribution': 'learning', 'Tables': 'not_started',
  'Venn / Sets': 'not_started', 'Average': 'practicing', 'Base System': 'not_started', 'Circles': 'not_started',
  'Coordinate Geometry': 'not_started', 'Divisibility': 'not_started', 'Functions': 'not_started', 'HCF & LCM': 'not_started',
  'Inequalities': 'not_started', 'Linear Equations': 'not_started', 'Lines & Angles': 'not_started', 'Logarithms': 'not_started',
  'Mensuration': 'not_started', 'Mixtures': 'learning', 'Percentages': 'practicing', 'Permutation & Combination': 'not_started',
  'Pipes & Cisterns': 'practicing', 'Probability': 'not_started', 'Profit & Loss': 'practicing', 'Progressions': 'not_started',
  'Quadratic Equations': 'not_started', 'Quadrilaterals': 'not_started', 'Ratio & Proportion': 'revising', 'Remainders': 'not_started',
  'SI & CI': 'practicing', 'Set Theory': 'not_started', 'Time & Work': 'revising', 'Time Speed Distance': 'learning',
  'Triangles': 'not_started', 'Editorial Reading': 'not_started', 'Grammar': 'learning', 'Odd One Out': 'not_started',
  'Para Jumbles': 'not_started', 'Para Summary': 'learning', 'Reading Comprehension': 'learning', 'Reading Speed Practice': 'not_started',
  'Sentence Completion': 'not_started', 'Vocabulary': 'learning',
};

describe('self-report survives end-to-end (the original bug, regression-proofed)', () => {
  it('VARC self-report is echoed back on the result, never dropped', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(FEA4A910), selfReportedWeakestSection: 'VARC', selfReportStatus: 'SELECTED_SECTION' });
    expect(r.selfReportedWeakestSection).toBe('VARC');
    expect(r.selfReportStatus).toBe('SELECTED_SECTION');
  });

  it('QA self-report is echoed back on the result', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({}), selfReportedWeakestSection: 'QA', selfReportStatus: 'SELECTED_SECTION' });
    expect(r.selfReportedWeakestSection).toBe('QA');
  });

  it('DILR self-report is echoed back on the result', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({}), selfReportedWeakestSection: 'DILR', selfReportStatus: 'SELECTED_SECTION' });
    expect(r.selfReportedWeakestSection).toBe('DILR');
  });

  it('NOT_SURE_YET survives as its own explicit state, not a section guess', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({}), selfReportedWeakestSection: null, selfReportStatus: 'NOT_SURE_YET' });
    expect(r.selfReportStatus).toBe('NOT_SURE_YET');
    expect(r.selfReportedWeakestSection).toBeNull();
  });

  it('historical null (no status at all) stays null, never reinterpreted as NOT_SURE_YET', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({}), selfReportedWeakestSection: null, selfReportStatus: null });
    expect(r.selfReportStatus).toBeNull();
    expect(r.selfReportedWeakestSection).toBeNull();
  });
});

describe('saturation guard — the confirmed-live production bug', () => {
  it('a fully untouched matrix with a real self-report does not manufacture a section winner', () => {
    // b4f30fbb, real production student: self-reported QA, every one of the
    // 46 topics not_started. Before this fix, the DILR->QA->VARC tie-break
    // would have named DILR — contradicting this student's own real answer
    // for no reason but arithmetic.
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({}), selfReportedWeakestSection: 'QA', selfReportStatus: 'SELECTED_SECTION' });
    expect(r.state).toBe('insufficient_evidence');
    expect(r.primary).toBeNull();
    // The self-report must still be visible on the result even when nothing
    // section-comparative can be claimed — the render layer's acknowledgement
    // depends on this.
    expect(r.selfReportedWeakestSection).toBe('QA');
  });

  it('never names DILR specifically as a fallback when saturated, regardless of self-report', () => {
    for (const sec of ['VARC', 'DILR', 'QA'] as const) {
      const r = computePrepInsight({ ...BASE, matrix: fullMatrix({}), selfReportedWeakestSection: sec, selfReportStatus: 'SELECTED_SECTION' });
      expect(r.state).toBe('insufficient_evidence');
      expect(r.cards.some((c) => c.headline.includes('DILR'))).toBe(false);
    }
  });
});

describe('foundation gate is qualitative, not a scheduling-score comparison', () => {
  it('a `learning`-stage parent topic does NOT produce a foundation finding (Part F correction)', () => {
    // Hybrid DILR Sets sits on Tables — both real topics, both weightage 4 —
    // but Hybrid DILR Sets is only `learning`, not practicing/revising, so
    // per the locked architecture it must not surface as a foundation gap
    // even though the relationship is otherwise exactly the shape that does
    // qualify (a4a286c2's real data has exactly this pattern).
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(A4A286C2), selfReportedWeakestSection: null, selfReportStatus: null });
    expect(r.cards.some((c) => c.key === 'foundation-gap')).toBe(false);
  });

  it('a `practicing`/`revising`-stage parent topic DOES qualify (the real Functions/Linear-Equations case)', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(FEA4A910), selfReportedWeakestSection: 'VARC', selfReportStatus: 'SELECTED_SECTION' });
    const foundation = r.cards.find((c) => c.key === 'foundation-gap');
    expect(foundation).toBeDefined();
    expect(foundation!.stats).toContain('Functions → revising');
    expect(foundation!.stats!.some((s) => s.includes('Linear Equations'))).toBe(true);
    expect(foundation!.stats!.some((s) => s.includes('2 levels beneath it'))).toBe(true);
  });

  it('never states a causal claim about how questions feel — structural relationship only', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(FEA4A910), selfReportedWeakestSection: 'VARC', selfReportStatus: 'SELECTED_SECTION' });
    const all = r.cards.map((c) => `${c.headline} ${c.note ?? ''}`).join(' ');
    expect(all).not.toMatch(/feel(s)? random/i);
    expect(all).not.toMatch(/that's why/i);
  });
});

describe('four real-production regression cases (development corpus, not a distribution)', () => {
  it('fea4a910 (self-reported VARC): no VARC-specific evidence fires, so the honest primary is the real QA foundation gap, self-report still echoed', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(FEA4A910), selfReportedWeakestSection: 'VARC', selfReportStatus: 'SELECTED_SECTION' });
    expect(r.state).toBe('diagnosed');
    expect(r.selfReportedWeakestSection).toBe('VARC'); // never dropped, even though primary is elsewhere
    expect(r.primary?.key).toBe('foundation-gap');
    expect(r.primary?.section).toBe('QA');
    expect(r.primarySource).toBe('careerrai'); // NOT 'student' — this did not come from the self-report
  });

  it('8ac65fdf (no self-report): primary is the real SI & CI / Percentages foundation gap', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(EIGHT_AC), selfReportedWeakestSection: null, selfReportStatus: null });
    expect(r.primary?.key).toBe('foundation-gap');
    expect(r.primary?.stats).toContain('SI & CI → practising');
    expect(r.primary?.stats!.some((s) => s.includes('Percentages'))).toBe(true);
    expect(r.secondary?.section).toBe('DILR'); // the real cross-section imbalance finding
  });

  it('a4a286c2 (no self-report): the learning-stage Hybrid-DILR-Sets/Tables link correctly does NOT surface; RC-neglect is the real finding instead', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(A4A286C2), selfReportedWeakestSection: null, selfReportStatus: null });
    expect(r.primary?.key).toBe('rc-neglect');
    expect(r.primary?.section).toBe('VARC');
  });

  it('b4f30fbb (self-reported QA, fully saturated): insufficient evidence, never an arbitrary DILR claim', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({}), selfReportedWeakestSection: 'QA', selfReportStatus: 'SELECTED_SECTION' });
    expect(r.state).toBe('insufficient_evidence');
    expect(r.selfReportedWeakestSection).toBe('QA');
  });
});

describe('no cross-section weightage number ever appears in generated copy', () => {
  it('no card headline/note/stats/action contains a raw weightage-looking number or "weightage"', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(EIGHT_AC), selfReportedWeakestSection: null, selfReportStatus: null });
    const text = r.cards.flatMap((c) => [c.headline, c.note ?? '', c.action ?? '', ...(c.stats ?? [])]).join(' ');
    expect(text.toLowerCase()).not.toContain('weightage');
    expect(text).not.toMatch(/\d+%\s*(weightage|of the paper|of marks)/i);
  });
});

// ── discoverySection — 16 Aug founder review ─────────────────────────────────
//
// A real student self-reported QA; the Instant Insight hero card was a real,
// correct DILR foundation gap (Caselets, revising, sitting on an untouched
// Tables — confirmed against real production topic_coverage during the
// investigation this fixes). The architecture was right: self-report doesn't
// suppress a genuine cross-section discovery. But the screen never disclosed
// WHICH section the discovery was in, so a real "we looked beyond QA and
// found something" moment read as a flat, same-topic restatement.
//
// `discoverySection` is the entire fix: given the winning primary and the
// `primarySource` the engine already computed, decide whether to name the
// section. No detector, ranking, or Validation/Discovery selection logic
// changes here — every fixture below reuses the exact selection behaviour
// proven above; these tests only check the disclosure decision layered on
// top of it.
function allSectionOverrides(section: 'QA' | 'DILR' | 'VARC', status: MatrixEntry['status']): Record<string, MatrixEntry['status']> {
  const out: Record<string, MatrixEntry['status']> = {};
  for (const [topic, meta] of Object.entries(TOPIC_METADATA)) {
    if (meta.section === section) out[topic] = status;
  }
  return out;
}

describe('discoverySection — names the section only when it genuinely differs from the self-report', () => {
  it('QA self-report, QA coverage clean (no unmet prereq, no untouched heavy topic), real DILR foundation gap: names DILR', () => {
    const overrides = { ...allSectionOverrides('QA', 'revising'), Caselets: 'practicing' as const, Tables: 'not_started' as const };
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(overrides), selfReportedWeakestSection: 'QA', selfReportStatus: 'SELECTED_SECTION' });
    expect(r.primary?.key).toBe('foundation-gap');
    expect(r.primary?.section).toBe('DILR');
    expect(r.primarySource).toBe('careerrai'); // no QA-sectioned risk fired — validation pool was genuinely empty
    expect(discoverySection(r.primary, r.primarySource)).toBe('DILR');
  });

  it('VARC self-report, real fea4a910 production data: the true finding is in QA — names QA', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(FEA4A910), selfReportedWeakestSection: 'VARC', selfReportStatus: 'SELECTED_SECTION' });
    expect(r.primary?.section).toBe('QA');
    expect(r.primarySource).toBe('careerrai');
    expect(discoverySection(r.primary, r.primarySource)).toBe('QA');
  });

  it('QA self-report, same real fea4a910 data: the finding IS in QA — same-section validation, never repeats the section', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(FEA4A910), selfReportedWeakestSection: 'QA', selfReportStatus: 'SELECTED_SECTION' });
    expect(r.primary?.section).toBe('QA');
    expect(r.primarySource).toBe('student');
    expect(discoverySection(r.primary, r.primarySource)).toBeNull();
  });

  it('NOT_SURE_YET, same clean-QA/DILR-gap matrix: still names DILR — nothing to differ FROM, but the section is real', () => {
    const overrides = { ...allSectionOverrides('QA', 'revising'), Caselets: 'practicing' as const, Tables: 'not_started' as const };
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(overrides), selfReportedWeakestSection: null, selfReportStatus: 'NOT_SURE_YET' });
    expect(r.primary?.section).toBe('DILR');
    expect(r.primarySource).toBe('careerrai');
    expect(discoverySection(r.primary, r.primarySource)).toBe('DILR');
  });

  it('same-section suppression is generic, not foundation-specific: an imbalance finding in the self-reported section is also never disclosed', () => {
    // QA and DILR driven to full mastery, VARC left untouched — VARC is both
    // the real weakest section AND the self-report, so detectImbalance fires
    // with section: 'VARC' on its own merits (a genuine validation finding,
    // not a foundation gap).
    const overrides = { ...allSectionOverrides('QA', 'revising'), ...allSectionOverrides('DILR', 'revising') };
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix(overrides), selfReportedWeakestSection: 'VARC', selfReportStatus: 'SELECTED_SECTION' });
    expect(r.primary?.key).toBe('imbalance-strategic');
    expect(r.primary?.section).toBe('VARC');
    expect(r.primarySource).toBe('student');
    expect(discoverySection(r.primary, r.primarySource)).toBeNull();
  });

  it('saturated / insufficient-evidence: no primary exists, so there is nothing to disclose', () => {
    const r = computePrepInsight({ ...BASE, matrix: fullMatrix({}), selfReportedWeakestSection: 'QA', selfReportStatus: 'SELECTED_SECTION' });
    expect(r.state).toBe('insufficient_evidence');
    expect(r.primary).toBeNull();
    expect(discoverySection(r.primary, r.primarySource)).toBeNull();
  });
});
