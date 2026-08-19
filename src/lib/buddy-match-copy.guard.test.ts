import { describe, it, expect } from 'vitest';
import { matchReason } from './buddy-match';

// ── A match reason describes the MENTOR, never the student's category ───────
//
// Founder, 19 Aug: "we have students as our target audience not just
// professionals". The working-professional rung read "Mentors working
// professionals like you" -- it filed the student under a label on a product
// whose audience is students, some of whom also have a job. Every other rung
// describes why THAT MENTOR is relevant. This one now does too.
//
// The trigger is deliberately unchanged. The signal was audited first:
// is_working_professional is an explicit, MANDATORY signup answer (Working /
// College / Full-time prep), all 53 students carrying it completed onboarding,
// and none of the 472 without it show contradicting work evidence.

const wpBuddy = {
  strongest_section: null, first_attempt_percentile: null, cat_percentile: null,
  student_types_helped: ['Working Professionals'],
};

describe('the working-professional rung', () => {
  it('names what the mentor has done, and says "students"', () => {
    const r = matchReason(
      { is_working_professional: true, is_repeater: false } as never,
      wpBuddy as never,
    );
    expect(r).toBe('Has mentored students balancing work and CAT prep');
  });

  it('never tells a student what they are', () => {
    const r = matchReason(
      { is_working_professional: true, is_repeater: false } as never,
      wpBuddy as never,
    );
    expect(r, 'the student is not a category to be filed under').not.toMatch(/professionals like you/i);
  });

  it('still fires only for a student who actually answered "working"', () => {
    for (const wp of [false, null]) {
      const r = matchReason(
        { is_working_professional: wp, is_repeater: false } as never,
        wpBuddy as never,
      );
      // matchReason returns null when no rung applies -- coalesce so the
      // assertion tests the copy, not the shape.
      expect(r ?? '', 'must not reach the 90% of students who are not working')
        .not.toMatch(/balancing work/);
    }
  });

  it('still requires the mentor to claim that experience', () => {
    const r = matchReason(
      { is_working_professional: true, is_repeater: false } as never,
      { ...wpBuddy, student_types_helped: ['Freshers'] } as never,
    );
    expect(r ?? '').not.toMatch(/balancing work/);
  });

  it('the more specific rungs still win', () => {
    // A weakest-section match is more useful than any archetype label.
    const r = matchReason(
      // weakestSection reads the BASELINE scores, and needs at least two to
      // pick a lowest -- not the self-reported field.
      { is_working_professional: true, is_repeater: false, baseline_dilr: 40, baseline_qa: 80 } as never,
      { ...wpBuddy, strongest_section: 'DILR' } as never,
    );
    expect(r).toMatch(/DILR/);
  });
});
