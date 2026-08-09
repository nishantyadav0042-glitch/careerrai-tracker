import { describe, it, expect } from 'vitest';
import { MENTOR_META, OVERLOAD_THRESHOLD, type MentorState } from './mentor-ops';

describe('Mentor Operations ranks mentors by urgency', () => {
  it('cannot-run-a-session is the top priority — a blocked paid promise', () => {
    expect(MENTOR_META.cant_run_session.priority).toBe(0);
    expect(MENTOR_META.cant_run_session.tone).toBe('red');
  });
  it('available is the lowest — a healthy mentor, shown only for assignment', () => {
    expect(MENTOR_META.available.priority).toBe(3);
    expect(MENTOR_META.available.tone).toBe('green');
  });
  it('a payout pending outranks nothing urgent but sits below missed sessions', () => {
    expect(MENTOR_META.payout_pending.priority).toBeGreaterThan(MENTOR_META.session_missed.priority);
    expect(MENTOR_META.session_missed.priority).toBeGreaterThan(MENTOR_META.cant_run_session.priority);
  });
  it('every state has an honest label and a known tone', () => {
    for (const s of Object.keys(MENTOR_META) as MentorState[]) {
      expect(MENTOR_META[s].label.length).toBeGreaterThan(3);
      expect(['red', 'amber', 'stone', 'green']).toContain(MENTOR_META[s].tone);
    }
  });
  it('the overload line is a real, sane number', () => {
    expect(OVERLOAD_THRESHOLD).toBeGreaterThan(1);
    expect(OVERLOAD_THRESHOLD).toBeLessThan(100);
  });
});
