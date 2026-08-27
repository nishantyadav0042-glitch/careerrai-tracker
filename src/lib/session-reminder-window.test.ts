import { describe, it, expect } from 'vitest';
import {
  sessionsDueForReminder, minutesUntil, reminderBody,
  REMINDER_LEAD_MS, REMINDER_FLOOR_MS,
  type RemindableSession, type PriorReminder,
} from './session-reminder-window';

const NOW = Date.parse('2026-08-29T10:00:00.000Z');
const inMin = (m: number) => new Date(NOW + m * 60_000).toISOString();

const session = (o: Partial<RemindableSession> = {}): RemindableSession => ({
  id: 'sess-1', scheduled_at: inMin(30), session_status: 'scheduled', ...o,
});

describe('sessionsDueForReminder — who gets reminded on this run', () => {
  it('reminds a session inside the lead window', () => {
    expect(sessionsDueForReminder([session()], [], NOW).map((s) => s.id)).toEqual(['sess-1']);
  });

  it('does not reach past the lead window', () => {
    const far = session({ scheduled_at: inMin(REMINDER_LEAD_MS / 60_000 + 5) });
    expect(sessionsDueForReminder([far], [], NOW)).toEqual([]);
  });

  it('does not remind a session that has already started', () => {
    expect(sessionsDueForReminder([session({ scheduled_at: inMin(-5) })], [], NOW)).toEqual([]);
  });

  it('does not remind inside the floor — it would land as the mentor says hello', () => {
    const tooClose = session({ scheduled_at: inMin(REMINDER_FLOOR_MS / 60_000 - 1) });
    expect(sessionsDueForReminder([tooClose], [], NOW)).toEqual([]);
  });

  it('a session booked 20 minutes out is still reminded — a narrow band would miss it', () => {
    // This is why the window is a LEAD, not a T-35..T-25 band: a band depends
    // on the cron firing inside it, and a late booking falls straight through.
    expect(sessionsDueForReminder([session({ scheduled_at: inMin(20) })], [], NOW)).toHaveLength(1);
  });
});

describe('sessionsDueForReminder — only genuinely upcoming sessions', () => {
  it.each(['cancelled', 'expired', 'completed', 'active'])(
    'never reminds a %s session',
    (status) => {
      expect(sessionsDueForReminder([session({ session_status: status })], [], NOW)).toEqual([]);
    },
  );

  it('ignores an unparseable start time rather than throwing', () => {
    expect(sessionsDueForReminder([session({ scheduled_at: 'nonsense' })], [], NOW)).toEqual([]);
  });
});

describe('sessionsDueForReminder — dedup that survives a reschedule', () => {
  const prior = (o: Partial<PriorReminder> = {}): PriorReminder => ({
    sessionId: 'sess-1', remindedFor: inMin(30), ...o,
  });

  it('does not remind twice for the same start time', () => {
    expect(sessionsDueForReminder([session()], [prior()], NOW)).toEqual([]);
  });

  it('DOES remind again when the session was moved to a new time', () => {
    // The bug a session-id-only dedup would ship: reminded for 10:30, moved to
    // 10:25, and the student never hears about the time they are expected.
    const moved = session({ scheduled_at: inMin(25) });
    expect(sessionsDueForReminder([moved], [prior({ remindedFor: inMin(30) })], NOW))
      .toHaveLength(1);
  });

  it('treats equivalent timestamp formats as the same moment', () => {
    const iso = '2026-08-29T10:30:00.000Z';
    const offset = '2026-08-29T10:30:00+00:00';
    expect(sessionsDueForReminder(
      [session({ scheduled_at: iso })], [prior({ remindedFor: offset })], NOW,
    )).toEqual([]);
  });

  it('a prior reminder with no recorded time does not suppress anything', () => {
    // Fail OPEN here: an unusable dedup record must not silently cancel a
    // reminder the student is owed.
    expect(sessionsDueForReminder([session()], [prior({ remindedFor: null })], NOW))
      .toHaveLength(1);
  });

  it('a reminder for a DIFFERENT session never suppresses this one', () => {
    expect(sessionsDueForReminder([session()], [prior({ sessionId: 'other' })], NOW))
      .toHaveLength(1);
  });

  it('handles a mixed batch without cross-contamination', () => {
    const due = sessionsDueForReminder(
      [
        session({ id: 'a', scheduled_at: inMin(10) }),
        session({ id: 'b', scheduled_at: inMin(20) }),
        session({ id: 'c', scheduled_at: inMin(30) }),
      ],
      [{ sessionId: 'b', remindedFor: inMin(20) }],
      NOW,
    );
    expect(due.map((s) => s.id).sort()).toEqual(['a', 'c']);
  });
});

describe('the copy is honest about the clock', () => {
  it('states the real number of minutes, not a hardcoded 30', () => {
    expect(reminderBody({ minutes: 12, buddyFirstName: 'Shreya', meetLink: null }))
      .toContain('in 12 minutes');
  });

  it('says "starts now" rather than "in 1 minutes"', () => {
    const b = reminderBody({ minutes: 1, buddyFirstName: 'Shreya', meetLink: null });
    expect(b).toContain('starts now');
    expect(b).not.toContain('1 minutes');
  });

  it('carries the join link in the message', () => {
    expect(reminderBody({ minutes: 20, buddyFirstName: 'Shreya', meetLink: 'https://m/x' }))
      .toContain('https://m/x');
  });

  it('degrades to a person when the name is missing', () => {
    expect(reminderBody({ minutes: 20, buddyFirstName: '', meetLink: null }))
      .toContain('your buddy');
  });

  it('minutesUntil rounds to whole minutes and rejects nonsense', () => {
    expect(minutesUntil(inMin(30), NOW)).toBe(30);
    expect(minutesUntil('nope', NOW)).toBeNull();
  });
});
