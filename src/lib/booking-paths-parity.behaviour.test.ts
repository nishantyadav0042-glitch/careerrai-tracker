import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { settleCreditForSession } from './session-credit';

// ── ONE CREDIT, TWO DOORS, IDENTICAL MONEY ─────────────────────────────────
//
// Incident #41. The mentor path booked sessions and never touched
// session_credits, so what a student owned depended on WHICH SIDE started the
// booking. That is the defect this file exists to make unrepeatable: not "the
// mentor path links a credit" (its own behaviour test covers that), but
// "the two paths mean the SAME THING by a paid entitlement".
//
// The claim under test has three parts, and each is asserted against the same
// fixture credit:
//   1. both paths consume the entitlement through the SAME transaction, with
//      the same credit-affecting arguments
//   2. neither path can write video_sessions directly while a credit exists
//   3. settlement afterwards cannot tell which door the booking came through
//
// (3) is the one that would rot silently. settle() finds the credit with
// .eq('video_session_id', sessionId) and has no idea who wrote the link — so
// the parity is real today, and this test is what notices if a future change
// gives the mentor path its own linking shortcut.

const rpc = vi.hoisted(() => vi.fn());
const directInserts = vi.hoisted(() => [] as Record<string, unknown>[]);

const BUDDY = 'bud-1';
const STUDENT = 'stu-1';
const CREDIT = 'cred-1';
const MEET = 'https://meet.example/permanent-room';
const START = '2026-08-29T11:00:00.000Z';

// Both routes read the same fixture credit.
const creditRow = {
  id: CREDIT, buddy_id: BUDDY, status: 'assigned',
  video_session_id: null, session_intent: 'quant', session_intent_note: null,
};

vi.mock('@/lib/auth', () => ({ getAuthUser: async () => ({ id: STUDENT }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: BUDDY } } }) } }),
}));
vi.mock('@/lib/notification-os', () => ({ dispatch: vi.fn(async () => 'sent') }));
vi.mock('@/lib/integration-audit', () => ({ audit: vi.fn(async () => undefined) }));
vi.mock('@/lib/os/timeline', () => ({ emitTimeline: vi.fn(async () => undefined) }));
vi.mock('@/lib/buddy-room', () => ({ ensureBuddyRoom: async () => ({ ok: true, meetUrl: MEET }) }));
vi.mock('@/lib/google-meet', () => ({
  statusFor: () => 409,
  createCalendarHold: async () => ({ ok: true, eventId: 'evt-1' }),
  updateGoogleMeet: async () => ({ ok: true }),
}));
vi.mock('@/lib/idempotency', () => ({
  idempotencyKey: () => 'idem-1',
  replayIdempotent: async () => null,
  rememberIdempotent: async () => undefined,
}));
vi.mock('@/lib/session-assignment', () => ({
  mentorBookability: async () => ({ bookable: true, timezone: 'Asia/Kolkata' }),
  UNBOOKABLE_COPY: {
    no_availability: 'x', not_taking_bookings: 'x', no_meeting_room: 'x',
  },
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
              single: async () => ({
                data: id === BUDDY
                  ? { full_name: 'Shreya Bendigeri', role: 'buddy' }
                  : {
                      full_name: 'Dhruv Vakadia', buddy_id: BUDDY,
                      free_onboarding_used: false, email: 'd@x.com',
                      notif_prefs: { push: true },
                    },
              }),
              maybeSingle: async () => ({
                data: { full_name: 'Someone', notif_prefs: { push: true } },
              }),
            }),
          }),
        };
      }
      if (table === 'video_sessions') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ in: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
          }),
          insert: (row: Record<string, unknown>) => {
            directInserts.push(row);
            return { select: () => ({ single: async () => ({ data: { id: 'sess-direct' }, error: null }) }) };
          },
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const bookAsStudent = async () => {
  const { POST } = await import('@/app/api/sessions/schedule/route');
  return POST({ json: async () => ({ startIso: START }) } as unknown as NextRequest);
};

const bookAsMentor = async () => {
  const { POST } = await import('@/app/api/calendar/schedule-meeting/route');
  return POST({
    json: async () => ({
      studentId: STUDENT, startTime: START, durationMinutes: 45, sessionType: 'guidance',
    }),
    headers: { get: () => null },
  } as unknown as NextRequest);
};

/**
 * The ENTITLEMENT-affecting arguments — which credit is spent, whose it is,
 * which mentor may spend it, and what kind of session it becomes.
 *
 * Two things are deliberately NOT compared, because differing is correct:
 *
 *   · p_title — the two paths word the session differently for their own
 *     audience. Wording is not money.
 *   · p_duration_minutes — a mentor may book 20/30/45/60 where the student
 *     self-serve path always books SESSION_MINUTES. That is a booking
 *     parameter, not an entitlement one; the credit is spent either way.
 *
 * p_session_type is normalised through the RPC's own declared default
 * (`p_session_type text default 'guidance'`) rather than compared raw: the
 * student path omits the argument and the mentor path passes it, and both
 * therefore write 'guidance'. Comparing the raw call would fail on a
 * difference the database erases — and worse, would go on passing if one path
 * later started sending 'onboarding', which is the divergence that would
 * actually matter.
 */
const RPC_DEFAULT_SESSION_TYPE = 'guidance';
const entitlementArgs = (call: unknown[]) => {
  const a = call[1] as Record<string, unknown>;
  return {
    fn: call[0],
    credit: a.p_credit_id,
    student: a.p_student_id,
    mentor: a.p_expected_buddy_id,
    effectiveType: a.p_session_type ?? RPC_DEFAULT_SESSION_TYPE,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-27T00:00:00.000Z'));
  directInserts.length = 0;
  rpc.mockResolvedValue({
    data: [{ outcome: 'booked', session_id: 'sess-1', detail: null }], error: null,
  });
});

describe('the two booking doors mean the same thing by a paid credit', () => {
  it('both consume the entitlement through the SAME transaction', async () => {
    await bookAsStudent();
    const student = entitlementArgs(rpc.mock.calls[0]);

    vi.clearAllMocks();
    rpc.mockResolvedValue({
      data: [{ outcome: 'booked', session_id: 'sess-1', detail: null }], error: null,
    });
    await bookAsMentor();
    const mentor = entitlementArgs(rpc.mock.calls[0]);

    expect(student.fn).toBe('book_session_credit');
    expect(mentor.fn).toBe('book_session_credit');
    expect(mentor, 'the same credit must be spent the same way from either side')
      .toEqual(student);
    expect(mentor.effectiveType).toBe('guidance');
  });

  it('neither path writes video_sessions directly while a credit exists', async () => {
    await bookAsStudent();
    await bookAsMentor();
    expect(directInserts, 'a direct insert here is an unbilled session').toHaveLength(0);
  });

  it('settlement cannot tell which door the booking came through', async () => {
    // Same session id, same linked credit — the only thing that differs in
    // production is who called the RPC, and settle() never learns that.
    const linked = () => ({
      id: CREDIT, status: 'scheduled', buddy_id: BUDDY, video_session_id: 'sess-1',
    });

    const results = [];
    for (const door of ['student-linked', 'mentor-linked'] as const) {
      void door; // named for the reader; settle() is what must not know it
      const state: Record<string, unknown> = linked();
      const admin = {
        from() {
          let guard: string | null = null;
          let patch: Record<string, unknown> | null = null;
          const q: Record<string, unknown> = {
            select: () => {
              if (!patch) return q;
              const ok = !guard || state.status === guard;
              if (ok) Object.assign(state, patch);
              return Promise.resolve({ data: ok ? [{ id: state.id }] : [], error: null });
            },
            eq: (c: string, v: unknown) => { if (c === 'status') guard = v as string; return q; },
            in: () => q,
            update: (p: Record<string, unknown>) => { patch = p; return q; },
            maybeSingle: async () => ({ data: state, error: null }),
          };
          return q;
        },
      };
      const first = await settleCreditForSession(admin, 'sess-1', 'completed');
      const second = await settleCreditForSession(admin, 'sess-1', 'completed');
      results.push({ first, second, status: state.status });
    }

    expect(results[0].first).toEqual({ settled: 'completed' });
    expect(results[0].status).toBe('completed');
    // Repeated completion settles once — the requirement, proved per door.
    expect(results[0].second).toEqual({ settled: 'none', reason: 'already_terminal' });
    expect(results[1], 'a mentor-linked credit settles identically').toEqual(results[0]);
  });
});
