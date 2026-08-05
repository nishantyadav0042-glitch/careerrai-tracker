import { describe, it, expect } from 'vitest';

// Incident #21, 5 Aug. A mentor and her first paying student could not get
// into the same call. Her words: "Your meeting link is not good", "I have been
// getting dropped off multiple times", and — decisively —
// "I am in separate meeting with Harsh."
//
// She was right. Rescheduling INSERTED a new session with a new Daily room and
// left every earlier one live. In one evening that pair accumulated FOUR live
// sessions with FOUR different rooms. Two of them were scheduled for the SAME
// MINUTE (19:00), and every surface picked "the first row by scheduled_at" —
// so with a tied sort key the database was free to return a different winner
// per query. Student's phone: room A. Mentor's phone: room B. Re-render:
// possibly room C, which is what "dropped off multiple times" feels like.
//
// Daily was never at fault. These tests pin the two rules that make a shared
// room deterministic, expressed as pure logic so they cannot silently rot.

type Session = { id: string; scheduledAt: string; createdAt: string; status: 'scheduled' | 'cancelled' };

/** Mirrors the ordering every session query now uses. */
function pickSession(rows: Session[]): Session | null {
  return rows
    .filter((r) => r.status === 'scheduled')
    .sort((a, b) =>
      a.scheduledAt.localeCompare(b.scheduledAt) ||
      b.createdAt.localeCompare(a.createdAt)   // tie-break: newest booking wins
    )[0] ?? null;
}

/** Mirrors the supersede step in schedule-meeting. */
function bookSession(existing: Session[], fresh: Session): Session[] {
  return [...existing.map((s) => ({ ...s, status: 'cancelled' as const })), fresh];
}

// The real rows from that evening.
const THAT_NIGHT: Session[] = [
  { id: 'a', scheduledAt: '2026-08-05T16:30', createdAt: '2026-08-05T11:46', status: 'scheduled' },
  { id: 'b', scheduledAt: '2026-08-05T18:00', createdAt: '2026-08-05T17:20', status: 'cancelled' },
  { id: 'c', scheduledAt: '2026-08-05T19:00', createdAt: '2026-08-05T17:20', status: 'scheduled' },
  { id: 'd', scheduledAt: '2026-08-05T19:00', createdAt: '2026-08-05T17:35', status: 'scheduled' }, // same minute as c
  { id: 'e', scheduledAt: '2026-08-05T19:30', createdAt: '2026-08-05T19:23', status: 'scheduled' },
];

describe('two people always resolve to the SAME session', () => {
  it('a tie on scheduled_at is broken deterministically, not by luck', () => {
    // Feed the identical rows in different orders — as two independent queries
    // legitimately may — and both sides must still pick the same session.
    const studentView = pickSession([...THAT_NIGHT]);
    const buddyView = pickSession([...THAT_NIGHT].reverse());
    expect(studentView?.id).toBe(buddyView?.id);
  });

  it('when two sessions share a minute, the newer booking wins', () => {
    const chosen = pickSession([
      { id: 'c', scheduledAt: '2026-08-05T19:00', createdAt: '2026-08-05T17:20', status: 'scheduled' },
      { id: 'd', scheduledAt: '2026-08-05T19:00', createdAt: '2026-08-05T17:35', status: 'scheduled' },
    ]);
    expect(chosen?.id).toBe('d');
  });
});

describe('a pair never has two live sessions at once', () => {
  it('booking supersedes every earlier live session', () => {
    const after = bookSession(THAT_NIGHT, {
      id: 'new', scheduledAt: '2026-08-05T20:00', createdAt: '2026-08-05T19:40', status: 'scheduled',
    });
    expect(after.filter((s) => s.status === 'scheduled')).toHaveLength(1);
    expect(pickSession(after)?.id).toBe('new');
  });

  it('the exact pile-up from 5 Aug can no longer occur', () => {
    // Replay the evening one booking at a time.
    let state: Session[] = [];
    for (const s of THAT_NIGHT) {
      state = bookSession(state, { ...s, status: 'scheduled' });
      expect(state.filter((x) => x.status === 'scheduled').length,
        'more than one live session for a pair').toBe(1);
    }
    expect(pickSession(state)?.id).toBe('e'); // the last booking is the session
  });
});
