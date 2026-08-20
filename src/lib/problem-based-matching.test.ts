import { describe, it, expect } from 'vitest';
import { rankBuddies, matchReason, findPlateau, PLATEAU_MIN_DAYS, type MatchStudent, type MatchBuddy } from '@/lib/buddy-match';

// ── Buddy matching consumes the plan's authority, not its own opinion ───────
//
// Founder ruling (Batch 8): one canonical answer to "what is this student
// struggling with?". Matching reads resolveFocusSections' output (value +
// source) instead of the baseline columns populated for 1 of 553 students.
// Priority: mock > genuine plateau > self-report > coverage > repeater/WP
// relevance > profile completeness as tie-break only.

const buddy = (o: Partial<MatchBuddy>): MatchBuddy => ({
  id: 'b1', full_name: 'B One', avatar_url: null, cat_percentile: 99,
  first_attempt_percentile: null, cat_year: 2025, iim_converted: 'IIM X',
  current_company: null, strongest_section: null, student_types_helped: null,
  how_i_work: null, linkedin_url: null, ...o,
});
const student = (o: Partial<MatchStudent>): MatchStudent => ({
  baseline_varc: null, baseline_dilr: null, baseline_qa: null,
  is_working_professional: null, is_repeater: null, ...o,
});

describe('evidence priority', () => {
  it('mock weakness beats self-report', () => {
    // Two buddies; the student's mock says QA, imagine self-report said VARC.
    // With focus_source='mock' the QA buddy must win and carry the mock reason.
    const s = student({ focus_weakest: 'QA', focus_source: 'mock' });
    const qa = buddy({ id: 'qa', strongest_section: 'QA' });
    const varc = buddy({ id: 'varc', strongest_section: 'VARC' });
    expect(rankBuddies(s, [varc, qa])[0].id).toBe('qa');
    expect(matchReason(s, qa)).toContain('your last mock exposed');
  });

  it('self-report beats coverage-derived weakness in wording and weight', () => {
    const sr = student({ focus_weakest: 'DILR', focus_source: 'self_report' });
    const cov = student({ focus_weakest: 'DILR', focus_source: 'coverage' });
    const b = buddy({ strongest_section: 'DILR' });
    expect(matchReason(sr, b)).toContain('you said you struggle with');
    expect(matchReason(cov, b)).toContain('syllabus map');
  });

  it('a genuine plateau outranks a self-reported section match', () => {
    const s = student({
      focus_weakest: 'VARC', focus_source: 'self_report',
      plateau: { topic: 'Arithmetic', section: 'QA' },
    });
    const qa = buddy({ id: 'qa', strongest_section: 'QA' });
    const varc = buddy({ id: 'varc', strongest_section: 'VARC' });
    expect(rankBuddies(s, [varc, qa])[0].id).toBe('qa');
    expect(matchReason(s, qa)).toContain('Arithmetic plateau');
  });

  it('the DILR default at the bottom of the chain scores and claims nothing', () => {
    // resolveFocusSections hard-falls-back to 'DILR'. A default is not a fact
    // about the student and must produce neither weight nor wording.
    const s = student({ focus_weakest: 'DILR', focus_source: 'default' });
    const dilr = buddy({ strongest_section: 'DILR' });
    expect(matchReason(s, dilr)).toBeNull();
    const other = buddy({ id: 'o', strongest_section: 'QA', avatar_url: 'x', linkedin_url: 'y' });
    // With no evidence, completeness decides — the DILR match earns nothing.
    expect(rankBuddies(s, [dilr, other])[0].id).toBe('o');
  });
});

describe('the plateau rule — repetition alone is never stuckness', () => {
  const day = (topic: string, date: string, confidence: string | null) =>
    ({ topic, section: 'QA', date, confidence });

  it('fires on repeated days ending in the student’s own struggle mark', () => {
    const p = findPlateau([
      day('Arithmetic', '2026-08-15', 'green'),
      day('Arithmetic', '2026-08-17', 'yellow'),
      day('Arithmetic', '2026-08-19', 'red'),
    ]);
    expect(p).toEqual({ topic: 'Arithmetic', section: 'QA' });
  });

  it('does NOT fire on repetition with green marks — that is practice', () => {
    const p = findPlateau([
      day('Arithmetic', '2026-08-15', 'green'),
      day('Arithmetic', '2026-08-17', 'green'),
      day('Arithmetic', '2026-08-19', 'green'),
    ]);
    expect(p).toBeNull();
  });

  it('does NOT fire when the struggle mark is old and the latest is green', () => {
    // The recovery case: struggled, then beat it. daily-insight praises this;
    // matching must not sell an intervention for it.
    const p = findPlateau([
      day('Arithmetic', '2026-08-15', 'red'),
      day('Arithmetic', '2026-08-17', 'red'),
      day('Arithmetic', '2026-08-19', 'green'),
    ]);
    expect(p).toBeNull();
  });

  it('needs the minimum distinct days, not repeated rows on one day', () => {
    const rows = Array.from({ length: PLATEAU_MIN_DAYS }, () => day('Arithmetic', '2026-08-19', 'red'));
    expect(findPlateau(rows)).toBeNull();
  });

  it('is deterministic when several topics qualify', () => {
    const rows = [
      day('Arithmetic', '2026-08-14', 'red'), day('Arithmetic', '2026-08-15', 'red'),
      day('Arithmetic', '2026-08-16', 'red'), day('Arithmetic', '2026-08-17', 'red'),
      day('Circles', '2026-08-15', 'red'), day('Circles', '2026-08-16', 'red'),
      day('Circles', '2026-08-17', 'red'),
    ];
    // Most repeated days wins.
    expect(findPlateau(rows)?.topic).toBe('Arithmetic');
    expect(findPlateau([...rows].reverse())?.topic).toBe('Arithmetic');
  });
});

describe('honesty and shape', () => {
  it('no student evidence produces no personalised reason', () => {
    const s = student({});
    const b = buddy({ strongest_section: 'QA', avatar_url: 'x' });
    expect(matchReason(s, b)).toBeNull();
  });

  it('profile completeness cannot generate a personalised claim', () => {
    const s = student({});
    const complete = buddy({ avatar_url: 'x', linkedin_url: 'y', how_i_work: 'z', iim_converted: 'IIM A' });
    expect(matchReason(s, complete)).toBeNull();
  });

  it('#1 is deterministic — same inputs, same order', () => {
    const s = student({ focus_weakest: 'QA', focus_source: 'coverage' });
    const list = [buddy({ id: 'a', strongest_section: 'QA' }), buddy({ id: 'b', strongest_section: 'QA', avatar_url: 'x' })];
    const first = rankBuddies(s, list).map((b) => b.id);
    for (let i = 0; i < 5; i++) expect(rankBuddies(s, list).map((b) => b.id)).toEqual(first);
  });

  it('ranking never duplicates a mentor', () => {
    const s = student({ focus_weakest: 'QA', focus_source: 'mock' });
    const list = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => buddy({ id, strongest_section: id === 'a' ? 'QA' : 'VARC' }));
    const ranked = rankBuddies(s, list);
    expect(new Set(ranked.map((b) => b.id)).size).toBe(ranked.length);
  });

  it('legacy callers without focus keep the old baseline behaviour', () => {
    // cron/buddy-evening builds MatchStudent without the new fields.
    const s = student({ baseline_varc: 60, baseline_dilr: 40, baseline_qa: 70 });
    const dilr = buddy({ strongest_section: 'DILR' });
    expect(matchReason(s, dilr)).toBe('Strong in DILR — your weakest section');
  });
});
