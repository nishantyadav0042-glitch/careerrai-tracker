import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── SESSION_CANCELLED speaks only for a cancellation it owns ────────────────
//
// Phase 0 audit finding F1: the route computed alreadySettled (the status-
// guarded update cancelled zero rows — the session had already finished, or a
// racing cancel got there first) and then notified the student ANYWAY. A
// student whose session COMPLETED normally could be told "Session cancelled";
// a double-cancel race sent two notices. These tests drive the real handler
// both ways and assert dispatch() fires exactly when this caller actually
// changed the state — and never otherwise.

const dispatch = vi.hoisted(() => vi.fn(async (o: Record<string, unknown>) => { void o; return 'sent'; }));

// What the status-guarded UPDATE returns: rows when this caller cancelled,
// empty when someone/something already settled the session.
let updateReturns: Array<{ id: string }>;
let sessionRow: Record<string, unknown>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'buddy-1' } } }) },
  }),
}));
vi.mock('@/lib/notification-os', () => ({ dispatch }));
vi.mock('@/lib/google-meet', () => ({ deleteGoogleMeet: async () => ({ ok: true }) }));
vi.mock('@/lib/integration-audit', () => ({ audit: async () => undefined }));
vi.mock('@/lib/session-link', () => ({ sessionNotificationUrl: () => '/student/buddy?tab=sessions' }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'video_sessions') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: sessionRow }) }) }),
          update: () => ({ eq: () => ({ in: () => ({ select: async () => ({ data: updateReturns, error: null }) }) }) }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { buddy_meet_event_id: null, notif_prefs: { push: true } } }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

async function callRoute() {
  const { POST } = await import('./route');
  const req = {
    json: async () => ({ meetingId: 'sess-1' }),
  } as unknown as NextRequest;
  return POST(req);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  sessionRow = {
    id: 'sess-1', buddy_id: 'buddy-1', student_id: 'stu-1',
    title: 'Guidance session', session_status: 'scheduled', google_event_id: null,
  };
});

describe('cancel-meeting × dispatch ownership (audit F1)', () => {
  it('a cancel that changed the state notifies the student, through dispatch()', async () => {
    updateReturns = [{ id: 'sess-1' }];
    const res = await callRoute();
    expect((await res.json()).success).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const opts = dispatch.mock.calls[0]![0];
    expect(opts.type).toBe('session_cancelled');
    expect(opts.userId).toBe('stu-1');
    expect(typeof opts.url).toBe('string'); // P0 events always land somewhere actionable
  });

  it('a cancel that lost the race (alreadySettled) stays SILENT — the session may have completed', async () => {
    updateReturns = []; // zero rows: someone else settled it first
    const res = await callRoute();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.alreadySettled).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('an already-cancelled session short-circuits before any dispatch', async () => {
    sessionRow = { ...sessionRow, session_status: 'cancelled' };
    const res = await callRoute();
    expect((await res.json()).alreadyCancelled).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("someone else's session is refused before any dispatch (authorization ≠ authentication)", async () => {
    sessionRow = { ...sessionRow, buddy_id: 'other-buddy' };
    const res = await callRoute();
    expect(res.status).toBe(403);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
