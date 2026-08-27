import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── A MENTOR-BOOKED GUIDANCE SESSION SPENDS THE STUDENT'S CREDIT ────────────
//
// Founder decision, 27 Aug: orientation is free, guidance costs a credit.
//
// The defect this closes: `grep -c session_credits` in the mentor booking
// route returned 0. A mentor could book the very session a student had paid
// ₹299 for, and the credit never learned about it — it stayed 'paid' with
// video_session_id null. Nothing was "wrong" in any single row, which is
// exactly the shape of Incident #31: the ledger says owed, the calendar says
// delivered, and no query joins the two. hasOpenSessionCredit() went on
// counting the credit open, so the student could not buy another one either.
//
// The guard test next door proves the wiring is present in the file. This
// proves the ROUTE BEHAVES: orientation must not touch a credit, guidance must
// go through book_session_credit(), and a student with no credit must not be
// handed a paid session for free.
//
// What is NOT simulated: the credit/session transition itself. That happens
// inside one Postgres transaction and a mock of it would only prove the mock.
// What IS asserted is that this route takes the RPC's verdict as final.

const dispatch = vi.hoisted(() => vi.fn(async (o: Record<string, unknown>) => { void o; return 'sent'; }));
const rpc = vi.hoisted(() => vi.fn());
const sessionInserts = vi.hoisted(() => [] as Record<string, unknown>[]);
const audit = vi.hoisted(() => vi.fn(async () => undefined));

const BUDDY = 'bud-1';
const STUDENT = 'stu-1';
const MEET = 'https://meet.example/permanent-room';

let creditRow: Record<string, unknown> | null;
let creditError: { message: string } | null;
let existingSession: Record<string, unknown> | null;
let freeOnboardingUsed: boolean;

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: BUDDY } } }) } }),
}));
vi.mock('@/lib/notification-os', () => ({ dispatch }));
vi.mock('@/lib/integration-audit', () => ({ audit }));
vi.mock('@/lib/buddy-room', () => ({ ensureBuddyRoom: async () => ({ ok: true, meetUrl: MEET }) }));
vi.mock('@/lib/google-meet', () => ({ statusFor: () => 409 }));
vi.mock('@/lib/idempotency', () => ({
  idempotencyKey: () => 'idem-1',
  replayIdempotent: async () => null,
  rememberIdempotent: async () => undefined,
}));

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
                  limit: () => ({
                    maybeSingle: async () => ({ data: creditRow, error: creditError }),
                  }),
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
              single: async () => ({
                data: id === BUDDY
                  ? { full_name: 'Shreya Bendigeri', role: 'buddy' }
                  : {
                      full_name: 'Dhruv Vakadia', buddy_id: BUDDY,
                      free_onboarding_used: freeOnboardingUsed,
                      email: 'd@example.com', notif_prefs: { push: true },
                    },
              }),
            }),
          }),
        };
      }
      if (table === 'video_sessions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({ maybeSingle: async () => ({ data: existingSession }) }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            sessionInserts.push(row);
            return {
              select: () => ({ single: async () => ({ data: { id: 'sess-direct' }, error: null }) }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const post = async (over: Record<string, unknown> = {}) => {
  const { POST } = await import('./route');
  return POST({
    json: async () => ({
      studentId: STUDENT,
      startTime: START,
      durationMinutes: 45,
      sessionType: 'guidance',
      ...over,
    }),
    headers: { get: () => null },
  } as unknown as NextRequest);
};

/** 29 Aug 2026, 11:00 UTC = 4:30 pm IST — comfortably in the future. */
const START = '2026-08-29T11:00:00.000Z';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-27T00:00:00.000Z'));
  sessionInserts.length = 0;
  creditRow = { id: 'cred-1', status: 'assigned', video_session_id: null };
  creditError = null;
  existingSession = null;
  freeOnboardingUsed = false;
  rpc.mockResolvedValue({
    data: [{ outcome: 'booked', session_id: 'sess-1', detail: null }], error: null,
  });
});

describe('a mentor-booked GUIDANCE session consumes a credit', () => {
  it('books through book_session_credit(), not a bare insert', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, meetingId: 'sess-1' });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(sessionInserts, 'guidance must never write video_sessions directly').toHaveLength(0);
  });

  it('books against THIS mentor, so someone else’s credit is refused by the database', () => {
    return post().then(() => {
      const [name, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
      expect(name).toBe('book_session_credit');
      expect(args.p_expected_buddy_id).toBe(BUDDY);
      expect(args.p_credit_id).toBe('cred-1');
      expect(args.p_student_id).toBe(STUDENT);
      expect(args.p_session_type).toBe('guidance');
      expect(args.p_meet_url).toBe(MEET);
    });
  });

  it('REFUSES a guidance booking when the student has no credit', async () => {
    creditRow = null;
    const res = await post();

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ reason: 'no_credit' });
    // The whole point of the rule: no session, no notification, nothing given
    // away. A mentor handing out the thing the product sells is the defect.
    expect(rpc).not.toHaveBeenCalled();
    expect(sessionInserts).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not tell the student "booked" when the RPC refused', async () => {
    rpc.mockResolvedValue({
      data: [{ outcome: 'slot_taken', session_id: null, detail: null }], error: null,
    });
    const res = await post();

    expect(res.status).toBe(409);
    expect(dispatch, 'a refused booking must not notify anyone').not.toHaveBeenCalled();
  });

  it('answers a re-submit with the session that already exists, not a second one', async () => {
    rpc.mockResolvedValue({
      data: [{ outcome: 'already_booked', session_id: 'sess-1', detail: null }], error: null,
    });
    const res = await post();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ meetingId: 'sess-1', already: true });
    expect(sessionInserts).toHaveLength(0);
  });

  it('surfaces a credit read failure as 503, never as a free session', async () => {
    creditError = { message: 'connection reset' };
    creditRow = null;
    const res = await post();

    expect(res.status).toBe(503);
    expect(sessionInserts).toHaveLength(0);
  });
});

describe('a mentor-booked ORIENTATION stays free', () => {
  it('writes the session directly and never touches a credit', async () => {
    const res = await post({ sessionType: 'onboarding' });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ meetingId: 'sess-direct' });
    expect(rpc, 'orientation must not consume a credit').not.toHaveBeenCalled();
    expect(sessionInserts).toHaveLength(1);
    expect(sessionInserts[0]).toMatchObject({ session_type: 'onboarding' });
  });

  it('still refuses a second free orientation', async () => {
    freeOnboardingUsed = true;
    const res = await post({ sessionType: 'onboarding' });

    expect(res.status).toBe(409);
    expect(sessionInserts).toHaveLength(0);
  });
});
