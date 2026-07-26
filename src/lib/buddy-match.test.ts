import { describe, it, expect } from 'vitest';
import { weakestSection, matchReason, rankBuddies, type MatchBuddy, type MatchStudent } from './buddy-match';

// Buddy matching decides which mentor a free student sees on the page where
// they choose whether to pay ₹2,999. Two failures live here:
//
//  1. A mentor's real journey was stored in the wrong field, so a mentor who
//     went 72 -> 98 was advertised as a 72%iler.
//  2. first_attempt_percentile is numeric(x,2), so the match reason rendered
//     "Improved 92.00->99.5%ile" in production.
//
// The deeper rule these tests protect: the copy must never claim something the
// data does not support — no "comeback" for a first-timer, no "great with
// first-timers" for a mentor who needed two attempts.

const buddy = (over: Partial<MatchBuddy> = {}): MatchBuddy => ({
  id: 'b1', full_name: 'Test Mentor', avatar_url: null,
  cat_percentile: 98, first_attempt_percentile: null, cat_year: 2023,
  iim_converted: 'IIM Raipur', current_company: null,
  strongest_section: null, student_types_helped: null,
  how_i_work: null, linkedin_url: null, ...over,
});

const student = (over: Partial<MatchStudent> = {}): MatchStudent => ({
  baseline_varc: null, baseline_dilr: null, baseline_qa: null,
  is_working_professional: null, is_repeater: null, ...over,
});

describe('weakestSection', () => {
  it('picks the lowest baseline', () => {
    expect(weakestSection(student({ baseline_varc: 80, baseline_dilr: 40, baseline_qa: 70 }))).toBe('DILR');
  });

  it('refuses to guess from a single data point', () => {
    expect(weakestSection(student({ baseline_qa: 40 }))).toBeNull();
    expect(weakestSection(student())).toBeNull();
  });

  it('works from two of three sections', () => {
    expect(weakestSection(student({ baseline_varc: 90, baseline_qa: 30 }))).toBe('QA');
  });
});

describe('matchReason — never claims more than the data supports', () => {
  it('leads with the section match, the most concrete reason', () => {
    const s = student({ baseline_varc: 30, baseline_dilr: 80, baseline_qa: 80 });
    expect(matchReason(s, buddy({ strongest_section: 'VARC' }))).toBe('Strong in VARC — your weakest section');
  });

  it('renders a real comeback without decimal noise (the 92.00 bug)', () => {
    const s = student({ is_repeater: true });
    const b = buddy({ first_attempt_percentile: 92 as unknown as number, cat_percentile: 99.5 });
    const reason = matchReason(s, b)!;
    expect(reason).toContain('92→99.5%ile');
    expect(reason).not.toMatch(/\d+\.00/);
  });

  it('survives values arriving as numeric strings from Postgres', () => {
    const s = student({ is_repeater: true });
    const b = buddy({
      first_attempt_percentile: '72.00' as unknown as number,
      cat_percentile: '98' as unknown as number,
    });
    expect(matchReason(s, b)).toContain('72→98%ile');
  });

  it('does not call a first-timer a comeback story', () => {
    const s = student({ is_repeater: true });
    const b = buddy({ first_attempt_percentile: null, cat_percentile: 99 });
    expect(matchReason(s, b) ?? '').not.toMatch(/Improved/);
  });

  it('does not claim a comeback when the two attempts are the same score', () => {
    // A real mentor has first_attempt 98.60 and final 98.6 — he cracked it
    // first time and the setup form recorded both. "Improved 98.6→98.6" reads
    // as a typo, not a journey.
    const s = student({ is_repeater: true });
    const b = buddy({ first_attempt_percentile: 98.6, cat_percentile: 98.6 });
    expect(matchReason(s, b) ?? '').not.toMatch(/Improved/);
  });

  it('does not sell a repeater mentor as great with first-timers', () => {
    const s = student({ is_repeater: false });
    const b = buddy({ first_attempt_percentile: 80, cat_percentile: 99, student_types_helped: ['Freshers'] });
    expect(matchReason(s, b) ?? '').not.toMatch(/first-time/);
  });

  it('does sell a genuine first-timer mentor to a fresher', () => {
    const s = student({ is_repeater: false });
    const b = buddy({ first_attempt_percentile: null, student_types_helped: ['Freshers'] });
    expect(matchReason(s, b)).toBe('Great with first-time aspirants');
  });

  it('returns null rather than inventing a reason', () => {
    expect(matchReason(student(), buddy())).toBeNull();
  });
});

describe('rankBuddies', () => {
  it('ranks the section specialist above a generically stronger mentor', () => {
    const s = student({ baseline_varc: 20, baseline_dilr: 90, baseline_qa: 90 });
    const specialist = buddy({ id: 'specialist', strongest_section: 'VARC', cat_percentile: 96 });
    const generalist = buddy({ id: 'generalist', strongest_section: 'QA', cat_percentile: 100 });
    expect(rankBuddies(s, [generalist, specialist])[0].id).toBe('specialist');
  });

  it('ranks a complete profile above a sparse one, all else equal', () => {
    const complete = buddy({ id: 'complete', avatar_url: 'a.png', linkedin_url: 'l', how_i_work: 'w' });
    const sparse = buddy({ id: 'sparse', iim_converted: null });
    expect(rankBuddies(student(), [sparse, complete])[0].id).toBe('complete');
  });

  it('puts a comeback mentor in front of a repeater student', () => {
    const s = student({ is_repeater: true });
    const comeback = buddy({ id: 'comeback', first_attempt_percentile: 72, cat_percentile: 98 });
    const other = buddy({ id: 'other', student_types_helped: ['Repeaters'] });
    expect(rankBuddies(s, [other, comeback])[0].id).toBe('comeback');
  });

  it('does not mutate the array it was given', () => {
    const list = [buddy({ id: 'a' }), buddy({ id: 'b', avatar_url: 'x.png' })];
    const before = list.map((b) => b.id);
    rankBuddies(student(), list);
    expect(list.map((b) => b.id)).toEqual(before);
  });

  it('returns every buddy it was given, never drops one', () => {
    const list = [buddy({ id: 'a' }), buddy({ id: 'b' }), buddy({ id: 'c' })];
    expect(rankBuddies(student(), list)).toHaveLength(3);
    expect(rankBuddies(student(), []).length).toBe(0);
  });
});
