import { describe, it, expect } from 'vitest';
import { determineAlignment, insightDisclosure, normalizeInsight, type PersistedInsight, type SelfReportState } from './insight-plan-handoff';

// ── The Insight → Plan handoff — six required cases + the plain-language
// copy check (founder, 15 Aug, two rounds of review) ────────────────────────
//
// Round 1 closed the trust gap: Instant Insight can correctly say "VARC, but
// we noticed a QA foundation gap," and the real plan can correctly still
// open with VARC (self-report outranks coverage in resolveFocusSections'
// evidence hierarchy) — but nothing told the student WHY. This module
// compares two already-decided things and explains the gap when one exists;
// it never recomputes the plan or the insight.
//
// Round 2 (this file) fixed two things the founder's pre-commit audit
// caught: the copy used technical vocabulary ("alignment," "stays on
// record") a student has no reason to understand, and the "you told us X"
// line was wrongly inferred from the INSIGHT's own source field instead of
// the student's actual self-report — those are two different facts and can
// disagree (a NOT_SURE_YET student can still receive a careerrai-sourced
// insight; a VARC self-reporter can still receive a QA discovery).

const noSelfReport: SelfReportState = { section: null, status: null };
const selfReportVarc: SelfReportState = { section: 'VARC', status: 'SELECTED_SECTION' };
const selfReportQa: SelfReportState = { section: 'QA', status: 'SELECTED_SECTION' };
const notSureYet: SelfReportState = { section: null, status: 'NOT_SURE_YET' };
const none: PersistedInsight = { section: null, topic: null, source: null, rootCause: null, recommend: null };

function insight(section: 'VARC' | 'DILR' | 'QA', source: 'student' | 'careerrai', recommend = 'start Linear Equations before more Functions', topic = 'Linear Equations'): PersistedInsight {
  return { section, topic, source, rootCause: 'foundation', recommend };
}

describe('Case 1 — self-report VARC, Insight VARC, Plan VARC', () => {
  it('is ALIGNED, no disclosure needed', () => {
    const i = insight('VARC', 'student');
    expect(determineAlignment(i, 'VARC')).toBe('ALIGNED');
    expect(insightDisclosure(i, 'VARC', selfReportVarc)).toBeNull();
  });
});

describe('Case 2 — self-report VARC, Insight QA foundation, Plan VARC — the exact founder example', () => {
  it('produces the plain three-part message: you told us / we noticed / what today does', () => {
    const i = insight('QA', 'careerrai');
    expect(determineAlignment(i, 'VARC')).toBe('DIFFERENT_BUT_VALID');
    const msg = insightDisclosure(i, 'VARC', selfReportVarc);
    expect(msg).toBe(
      "You told us VARC feels weakest. We also noticed something in QA: start Linear Equations before more Functions. " +
      "For today, we're prioritising VARC — that's the strongest signal we have about where you need attention right now."
    );
  });

  it('contains no technical vocabulary', () => {
    const msg = insightDisclosure(insight('QA', 'careerrai'), 'VARC', selfReportVarc)!;
    for (const jargon of ['alignment', 'source', 'root cause', 'stays on record', 'diagnostic', 'evidence hierarchy']) {
      expect(msg.toLowerCase()).not.toContain(jargon);
    }
  });

  it('never claims "actually QA is your weakness" or tells the student to ignore QA', () => {
    const msg = insightDisclosure(insight('QA', 'careerrai'), 'VARC', selfReportVarc)!;
    expect(msg).not.toMatch(/actually.*your weakness/i);
    expect(msg).not.toMatch(/ignore/i);
  });
});

describe('Case 3 — self-report QA, Insight VARC, Plan QA (self-report and plan agree; Insight is the odd one out)', () => {
  it('is DIFFERENT_BUT_VALID and still correctly attributes "you told us" to QA, not VARC', () => {
    const i = insight('VARC', 'careerrai', 'bring Reading Comprehension into practice', 'Reading Comprehension');
    expect(determineAlignment(i, 'QA')).toBe('DIFFERENT_BUT_VALID');
    const msg = insightDisclosure(i, 'QA', selfReportQa)!;
    expect(msg).toContain('You told us QA feels weakest.');
    expect(msg).toContain('We also noticed something in VARC');
    expect(msg).toContain('prioritising QA');
  });
});

describe('Case 4 — NOT_SURE_YET, Insight QA, Plan QA', () => {
  it('is ALIGNED, no disclosure — and if forced, the copy never says "you told us"', () => {
    const i = insight('QA', 'careerrai');
    expect(determineAlignment(i, 'QA')).toBe('ALIGNED');
    expect(insightDisclosure(i, 'QA', notSureYet)).toBeNull();
    // Force the differ path to prove the copy-generation function itself
    // respects the absence of a self-report, independent of the gate.
    const forced = insightDisclosure(i, 'DILR', notSureYet)!;
    expect(forced).not.toMatch(/you told us/i);
    expect(forced.startsWith('We also noticed')).toBe(true);
  });
});

describe('Case 4b — NOT_SURE_YET, Insight QA, Plan VARC', () => {
  it('is DIFFERENT_BUT_VALID with no "you told us" line at all', () => {
    const i = insight('QA', 'careerrai');
    expect(determineAlignment(i, 'VARC')).toBe('DIFFERENT_BUT_VALID');
    const msg = insightDisclosure(i, 'VARC', notSureYet)!;
    expect(msg).not.toMatch(/you told us/i);
    expect(msg).toContain('We also noticed something in QA');
    expect(msg).toContain('prioritising VARC');
  });
});

describe('Case 5 — no self-report at all, insufficient evidence, normal plan', () => {
  it('no insight was persisted — alignment and disclosure are both null, never a fabricated comparison', () => {
    expect(determineAlignment(none, 'DILR')).toBeNull();
    expect(insightDisclosure(none, 'DILR', noSelfReport)).toBeNull();
  });
});

describe('Case 6 — Insight recommends something with no valid persisted section, or malformed input', () => {
  it('a malformed/missing insight section produces no promise and no disclosure', () => {
    const malformed: PersistedInsight = { section: null, topic: 'Some Topic', source: 'careerrai', rootCause: 'foundation', recommend: 'do something' };
    expect(determineAlignment(malformed, 'QA')).toBeNull();
    expect(insightDisclosure(malformed, 'QA', noSelfReport)).toBeNull();
  });

  it('the disclosure never promises a specific future action the planner does not enforce', () => {
    const msg = insightDisclosure(insight('QA', 'careerrai'), 'VARC', selfReportVarc)!;
    expect(msg).not.toMatch(/tomorrow|next week|after that we('| wi)ll|we'll bring/i);
  });
});

describe('normalizeInsight — fails closed on malformed/legacy data', () => {
  it('an invalid section string never survives to become a comparable value', () => {
    const n = normalizeInsight({ section: 'not-a-real-section', topic: 'X', source: 'student', rootCause: 'foundation', recommend: 'do X' });
    expect(n.section).toBeNull();
    expect(n.recommend).toBeNull(); // no section to hang the recommendation on
  });

  it('an invalid source string never survives', () => {
    const n = normalizeInsight({ section: 'QA', source: 'the-algorithm', recommend: 'do X' });
    expect(n.source).toBeNull();
    expect(n.section).toBe('QA'); // section itself is still valid and kept
  });

  it('all-undefined input (a legacy/pre-migration profile row) normalizes to a fully-null, comparison-safe object', () => {
    const n = normalizeInsight({});
    expect(n).toEqual({ section: null, topic: null, source: null, rootCause: null, recommend: null });
    expect(determineAlignment(n, 'QA')).toBeNull();
  });

  it('an empty-string topic/recommend is treated as absent, not as a real empty claim', () => {
    const n = normalizeInsight({ section: 'QA', topic: '', recommend: '' });
    expect(n.topic).toBeNull();
    expect(n.recommend).toBeNull();
  });
});

describe('critical regression — fea4a910 (self-report VARC, real Insight = QA foundation gap)', () => {
  it('produces the exact founder-approved coherent explanation when the plan opens with VARC', () => {
    const i = insight('QA', 'careerrai', 'start Linear Equations before more Functions');
    expect(determineAlignment(i, 'VARC')).toBe('DIFFERENT_BUT_VALID');
    const msg = insightDisclosure(i, 'VARC', selfReportVarc)!;
    expect(msg).toContain('You told us VARC feels weakest.');
    expect(msg).toContain('We also noticed something in QA: start Linear Equations before more Functions.');
    expect(msg).toContain("For today, we're prioritising VARC");
    // The three explicit non-negotiables from the founder's message:
    expect(msg).not.toMatch(/actually.*qa is your weakness/i);
    expect(msg).not.toMatch(/ignore qa/i);
    expect(msg).not.toMatch(/tomorrow we('| wi)ll do qa/i);
  });

  it('does NOT change the underlying scheduling priority — VARC still wins when self-report says so', () => {
    // This module never decides `focus.weakest` — resolveFocusSections does,
    // unmodified. Proven here by construction: determineAlignment takes
    // planSection as a given input, never computes or overrides it.
    const i = insight('QA', 'careerrai');
    expect(determineAlignment(i, 'VARC')).toBe('DIFFERENT_BUT_VALID'); // explained
    expect(determineAlignment(i, 'VARC')).not.toBe('ALIGNED'); // never silently forced to match
  });
});
