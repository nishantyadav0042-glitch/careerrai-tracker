import { describe, it, expect } from 'vitest';
import { profileFacts } from './sales-profile-facts';

// ── The profile block says only what the student said ───────────────────────
//
// Founder, 2 Sep 2026: the Profile button must open "their whole profile".
// These pin the one rule that matters on that screen: a field the student
// never filled is ABSENT, never rendered as a default (L1).

describe('profileFacts', () => {
  it('an empty profile yields no facts — nothing is invented', () => {
    expect(profileFacts({})).toEqual([]);
    expect(profileFacts({ college: '', dream_colleges: [], hours_available: null })).toEqual([]);
  });

  it('renders the plain facts a counsellor reads, in reading order', () => {
    const facts = profileFacts({
      exam_target: 'CAT', attempt_year: 2026, attempt_number: 2, is_repeater: true, last_year_percentile: 84.5,
      is_working_professional: true, work_ex_months: 30,
      category: 'General', coaching_enrolled: false,
      hours_available: 2, weekend_hours_available: 6, study_target_hours: 3,
      study_windows: ['late_night', 'early_morning'],
      target_percentile: '99.00', starting_percentile: 70, dream_colleges: ['IIM A', 'IIM B'],
      success_goal: 'iim_abc', current_stage: 'mocks', biggest_blocker: 'time_management',
      created_at: '2026-09-01T15:13:05Z', signup_source: 'instagram', app_installed: true, email: 'p@example.test',
    });
    const labels = facts.map((f) => f.label);
    expect(labels).toEqual([
      'Exam', 'Attempt', 'Last attempt', 'Status', 'Category', 'Coaching', 'Hours', 'Daily target', 'Studies',
      'Target', 'Started at', 'Dream colleges', 'Goal', 'Stage', 'Blocker', 'Joined', 'App', 'Email',
    ]);
    const by = Object.fromEntries(facts.map((f) => [f.label, f.value]));
    expect(by.Exam).toBe('CAT 2026');
    expect(by.Attempt).toBe('#2');
    expect(by['Last attempt']).toBe('84.5%ile');
    expect(by.Status).toBe('working professional · 2.5 yrs experience');
    expect(by.Coaching).toBe('self-prep');
    expect(by.Hours).toBe('2h weekday · 6h weekend');
    expect(by.Studies).toBe('late night, early morning');
    expect(by.Target).toBe('99%ile');
    expect(by['Dream colleges']).toBe('IIM A, IIM B');
    expect(by.Joined).toBe('1 Sept 2026 · via instagram');
  });

  it('a college student reads as college · year; a first attempt reads as first', () => {
    const by = Object.fromEntries(profileFacts({ college: 'DU', course_year: 3, attempt_number: 1 }).map((f) => [f.label, f.value]));
    expect(by.Status).toBe('DU · year 3');
    expect(by.Attempt).toBe('first');
  });

  it('a percentile that is not a number is shown as given, never coerced to NaN', () => {
    const by = Object.fromEntries(profileFacts({ target_percentile: 'ninety-nine' as unknown as string }).map((f) => [f.label, f.value]));
    expect(by.Target).toBe('ninety-nine');
  });
});
