import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── THE WHOLE CHAIN, DRIVEN THROUGH THE REAL HANDLER ────────────────────────
//
// Founder gate before merge (27 Aug):
//
//   student books → credit scheduled → session created → buddy notified
//   → student notified → join link exists → cancellation/expiry settles
//   the credit exactly once
//
// The guard test next door proves the notifier is WIRED. That is a structural
// claim about the file. This one proves the chain BEHAVES: it runs POST and
// reads what actually came out — who was told, in what order, carrying what.
//
// The credit/session transition is deliberately NOT re-simulated here. It
// happens inside book_session_credit(), one Postgres transaction, and a mock
// of it would only prove the mock. What IS asserted is that this route takes
// the RPC's verdict as final — including refusing to notify when the RPC says
// the booking did not happen, which is the failure mode that would tell a
// student "booked" about a session nobody holds.

const dispatch = vi.hoisted(() => vi.fn(async (o: Record<string, unknown>) => { void o; return 'sent'; }));
const timeline = vi.hoisted(() => vi.fn(async () => undefined));
const rpc = vi.hoisted(() => vi.fn());

const STUDENT = 'stu-1';
const BUDDY = 'bud-1';
const MEET = 'https://meet.example/permanent-room';

let creditRow: Record<string, unknown> | null;
let bookable: { bookable: boolean; reason?: string; timezone?: string };
let room: { ok: boolean; meetUrl: string | null };

vi.mock('@/lib/auth', () => ({ getAuthUser: async () => ({ id: STUDENT }) }));
vi.mock('@/lib/notification-os', () => ({ dispatch }));
vi.mock('@/lib/os/timeline', () => ({ emitTimeline: timeline }));
vi.mock('@/lib/session-assignment', () => ({
  mentorBookability: async () => bookable,
  UNBOOKABLE_COPY: {
    no_availability: 'no availability copy',
    not_taking_bookings: 'not taking bookings copy',
    no_meeting_room: 'no meeting room copy',
  },
}));
vi.mock('@/lib/buddy-room', () => ({ ensureBuddyRoom: async () => room }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc,
    from: (table: string) => {
      if (table === 'session_credits') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: async () => ({ data: creditRow, error: null }) }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              maybeSingle: async () => ({
                data: id === BUDDY
                  ? { full_name: 'Shreya Bendigeri', notif_prefs: { push: true } }
                  : { full_name: 'Dhruv Vakadia', notif_prefs: { push: true } },
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const post = async (startIso: string) => {
  const { POST } = await import('./route');
  return POST({ json: async () => ({ startIso }) } as unknown as NextRequest);
};

/** 29 Aug 2026, 11:00 UTC = 4:30 pm IST. */
const START = '2026-08-29T11:00:00.000Z';

beforeEach(() => {
  vi.clearAllMocks();
  creditRow = {
    id: 'cred-1', buddy_id: BUDDY, status: 'assigned',
    video_session_id: null, session_intent: 'quant', session_intent_note: null,
  };
  bookable = { bookable: true, timezone: 'Asia/Kolkata' };
  room = { ok: true, meetUrl: MEET };
  rpc.mockResolvedValue({
    data: [{ outcome: 'booked', session_id: 'sess-1', detail: null }], error: null,
  });
});

describe('booking chain — both humans are told, and told the truth', () => {
  it('notifies the student AND the buddy, exactly once each', async () => {
    const res = await post(START);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, sessionId: 'sess-1' });

    expect(dispatch).toHaveBeenCalledTimes(2);
    const recipients = dispatch.mock.calls.map((c) => (c[0] as { userId: string }).userId);
    expect(recipients).toEqual([STUDENT, BUDDY]);
  });

  it('the join link reaches BOTH of them, in the message body and the data', async () => {
    await post(START);
    for (const [payload] of dispatch.mock.calls) {
      const p = payload as { body: string; data: { meetLink: string; sessionId: string } };
      expect(p.body, 'the room link travels IN the message').toContain(MEET);
      expect(p.data.meetLink).toBe(MEET);
      expect(p.data.sessionId).toBe('sess-1');
    }
  });

  it('each side is told the time in IST and pointed at their own screen', async () => {
    await post(START);
    const [student, buddy] = dispatch.mock.calls.map(([p]) => p as Record<string, string>);

    expect(student.body).toContain('4:30');
    expect(buddy.body).toContain('4:30');

    expect(student.url).toBe('/student/buddy');
    expect(buddy.url).toBe('/buddy/home');
  });

  it('the buddy is told WHO booked them; the student is told WHO with', async () => {
    await post(START);
    const [student, buddy] = dispatch.mock.calls.map(([p]) => p as Record<string, string>);

    expect(buddy.body).toContain('Dhruv');
    expect(buddy.body).not.toContain('Vakadia');   // first name only
    expect(student.title).toContain('Shreya');
  });

  it('does NOT tell the student their buddy booked a slot the student picked', async () => {
    await post(START);
    const [student] = dispatch.mock.calls.map(([p]) => p as Record<string, string>);
    expect(student.body).not.toContain('your buddy booked');
    expect(student.body).toContain('your 1:1 is booked');
  });

  it('both notifications ride the ONE type the sibling route uses', async () => {
    await post(START);
    for (const [payload] of dispatch.mock.calls) {
      expect((payload as { type: string }).type).toBe('session_scheduled');
    }
  });
});

describe('booking chain — nobody is told about a booking that did not happen', () => {
  it('slot taken by someone else: 409, and NO notification', async () => {
    rpc.mockResolvedValue({
      data: [{ outcome: 'slot_taken', session_id: null, detail: null }], error: null,
    });
    const res = await post(START);
    expect(res.status).toBe(409);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a double-click does not produce a second session or a second pair of messages', async () => {
    // The credit already points at a session — the idempotent early return.
    creditRow = { ...creditRow!, video_session_id: 'sess-1' };
    const res = await post(START);
    await expect(res.json()).resolves.toMatchObject({ already: true, sessionId: 'sess-1' });
    expect(rpc).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('the RPC saying already_booked notifies nobody a second time', async () => {
    rpc.mockResolvedValue({
      data: [{ outcome: 'already_booked', session_id: 'sess-1', detail: null }], error: null,
    });
    const res = await post(START);
    await expect(res.json()).resolves.toMatchObject({ ok: true, already: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('an unbookable mentor is refused before any room or booking is attempted', async () => {
    bookable = { bookable: false, reason: 'no_availability' };
    const res = await post(START);
    expect(res.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('no meeting room means no booking — a session nobody can join is never created', async () => {
    room = { ok: false, meetUrl: null };
    const res = await post(START);
    expect(res.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('booking chain — a notification failure never costs the student their session', () => {
  it('the booking still succeeds when dispatch throws', async () => {
    dispatch.mockRejectedValueOnce(new Error('push transport down'));
    const res = await post(START);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, sessionId: 'sess-1' });
  });

  it('the timeline record is written even if telling people fails', async () => {
    dispatch.mockRejectedValueOnce(new Error('push transport down'));
    await post(START);
    expect(timeline).toHaveBeenCalledTimes(1);
  });
});
