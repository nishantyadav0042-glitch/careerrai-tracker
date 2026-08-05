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

type Session = {
  id: string; scheduledAt: string; createdAt: string;
  status: 'scheduled' | 'active' | 'cancelled';
  buddyId: string; studentId: string; durationMins: number;
};

/** Mirrors the ordering every session query now uses. */
function pickSession(rows: Session[]): Session | null {
  return rows
    .filter((r) => r.status === 'scheduled')
    .sort((a, b) =>
      a.scheduledAt.localeCompare(b.scheduledAt) ||
      b.createdAt.localeCompare(a.createdAt)   // tie-break: newest booking wins
    )[0] ?? null;
}

const LIVE = ['scheduled', 'active'] as const;
const BUFFER_MINS = 15;

/**
 * Mirrors the two DATABASE constraints that now govern booking:
 * `one_live_session_per_pair` and `no_overlapping_buddy_sessions`.
 *
 * Booking used to SUPERSEDE — it cancelled every earlier session and inserted
 * a new one. Founder rule, 5 Aug: it now REFUSES. A pair keeps exactly one
 * live session until someone cancels it, so the mentor and the student can
 * never disagree about which call is the call.
 */
function bookSession(
  existing: Session[],
  fresh: Session & { buddyId: string; studentId: string; durationMins: number },
): { ok: true; sessions: Session[] } | { ok: false; reason: 'session_exists' | 'buddy_double_booked' } {
  const live = existing.filter((s) => (LIVE as readonly string[]).includes(s.status));

  if (live.some((s) => s.buddyId === fresh.buddyId && s.studentId === fresh.studentId)) {
    return { ok: false, reason: 'session_exists' };
  }
  // Every session runs in the buddy's ONE permanent room, so two students in
  // overlapping slots would be two students in the same room. The buffer
  // covers the call that runs long.
  const spanOf = (s: { scheduledAt: string; durationMins: number }) => {
    const from = Date.parse(`${s.scheduledAt}Z`);
    return [from, from + (s.durationMins + BUFFER_MINS) * 60_000] as const;
  };
  const [freshFrom, freshTo] = spanOf(fresh);
  if (live.some((s) => {
    if (s.buddyId !== fresh.buddyId) return false;
    const [from, to] = spanOf(s);
    return freshFrom < to && from < freshTo;
  })) {
    return { ok: false, reason: 'buddy_double_booked' };
  }

  return { ok: true, sessions: [...existing, fresh] };
}

// The real rows from that evening — one buddy, one student, five bookings.
const P = { buddyId: 'vedashri', studentId: 'harsh', durationMins: 30 };
const THAT_NIGHT: Session[] = [
  { id: 'a', scheduledAt: '2026-08-05T16:30', createdAt: '2026-08-05T11:46', status: 'scheduled', ...P },
  { id: 'b', scheduledAt: '2026-08-05T18:00', createdAt: '2026-08-05T17:20', status: 'cancelled', ...P },
  { id: 'c', scheduledAt: '2026-08-05T19:00', createdAt: '2026-08-05T17:20', status: 'scheduled', ...P },
  { id: 'd', scheduledAt: '2026-08-05T19:00', createdAt: '2026-08-05T17:35', status: 'scheduled', ...P }, // same minute as c
  { id: 'e', scheduledAt: '2026-08-05T19:30', createdAt: '2026-08-05T19:23', status: 'scheduled', ...P },
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
      { id: 'c', scheduledAt: '2026-08-05T19:00', createdAt: '2026-08-05T17:20', status: 'scheduled', ...P },
      { id: 'd', scheduledAt: '2026-08-05T19:00', createdAt: '2026-08-05T17:35', status: 'scheduled', ...P },
    ]);
    expect(chosen?.id).toBe('d');
  });
});

describe('a pair never has two live sessions at once', () => {
  it('a second booking is REFUSED, not silently substituted', () => {
    const live: Session[] = [
      { id: 'a', scheduledAt: '2026-08-05T16:30', createdAt: '2026-08-05T11:46', status: 'scheduled', ...P },
    ];
    const res = bookSession(live, {
      id: 'new', scheduledAt: '2026-08-05T20:00', createdAt: '2026-08-05T19:40', status: 'scheduled', ...P,
    });
    expect(res).toEqual({ ok: false, reason: 'session_exists' });
  });

  it('cancelling frees the lock', () => {
    const cancelled: Session[] = [
      { id: 'a', scheduledAt: '2026-08-05T16:30', createdAt: '2026-08-05T11:46', status: 'cancelled', ...P },
    ];
    const res = bookSession(cancelled, {
      id: 'new', scheduledAt: '2026-08-05T20:00', createdAt: '2026-08-05T19:40', status: 'scheduled', ...P,
    });
    expect(res.ok).toBe(true);
  });

  it('an in-progress session also holds the lock', () => {
    const active: Session[] = [
      { id: 'a', scheduledAt: '2026-08-05T16:30', createdAt: '2026-08-05T11:46', status: 'active', ...P },
    ];
    expect(bookSession(active, {
      id: 'new', scheduledAt: '2026-08-05T20:00', createdAt: '2026-08-05T19:40', status: 'scheduled', ...P,
    })).toEqual({ ok: false, reason: 'session_exists' });
  });

  it('the exact pile-up from 5 Aug can no longer occur', () => {
    // Replay the evening one booking at a time. Every booking after the first
    // is now refused, so the pile-up never starts.
    let state: Session[] = [];
    let accepted = 0;
    for (const s of THAT_NIGHT) {
      const res = bookSession(state, { ...s, status: 'scheduled' });
      if (res.ok) { state = res.sessions; accepted++; }
      expect(state.filter((x) => x.status === 'scheduled').length,
        'more than one live session for a pair').toBeLessThanOrEqual(1);
    }
    expect(accepted).toBe(1);
    expect(pickSession(state)?.id).toBe('a');
  });
});

// One permanent Meet room per buddy (founder, 5 Aug) buys a stable link at the
// cost of a shared room. These are the tests that make the trade safe: two of
// a buddy's students must never be scheduled into it at the same time.
describe('a buddy is never double-booked', () => {
  const at = (hhmm: string, studentId: string, durationMins = 30): Session & { buddyId: string; studentId: string; durationMins: number } =>
    ({ id: hhmm + studentId, scheduledAt: `2026-08-05T${hhmm}`, createdAt: '2026-08-05T10:00', status: 'scheduled', buddyId: 'vedashri', studentId, durationMins });

  const existing = [at('19:00', 'harsh')]; // room busy 19:00 → 19:45 (30 + 15 buffer)

  it('refuses a straddling slot for a different student', () => {
    expect(bookSession(existing, at('19:20', 'sweccha'))).toEqual({ ok: false, reason: 'buddy_double_booked' });
  });

  it('refuses a slot inside the run-over buffer', () => {
    // 19:40 starts after Harsh's 30 minutes end but while the room is still
    // reserved. Without this, a call running five minutes long drops another
    // student into a live 1:1 — where the first is discussing their real
    // percentile. The buffer is a privacy guarantee, not politeness.
    expect(bookSession(existing, at('19:40', 'sweccha'))).toEqual({ ok: false, reason: 'buddy_double_booked' });
  });

  it('allows the next slot once the buffer has passed', () => {
    expect(bookSession(existing, at('19:45', 'sweccha')).ok).toBe(true);
  });

  it('leaves a DIFFERENT buddy free at the same time', () => {
    const other = { ...at('19:00', 'sweccha'), buddyId: 'shreya' };
    expect(bookSession(existing, other).ok).toBe(true);
  });

  it('ignores cancelled sessions when checking the room', () => {
    const freed: Session[] = [{ ...at('19:00', 'harsh'), status: 'cancelled' }];
    expect(bookSession(freed, at('19:00', 'sweccha')).ok).toBe(true);
  });
});
