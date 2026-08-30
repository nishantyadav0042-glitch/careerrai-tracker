import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── THE GATE ITSELF, EXERCISED (Incident #62) ──────────────────────────────
//
// A source guard would only prove the call is WRITTEN in the layout. The whole
// incident is that a correct rule sat behind a condition (`!existing`) that
// could never be true, so "it is in the file" is not evidence.
//
// So this calls the real StudentLayout and asserts what it DID: whether
// redirect() was reached, and with what. Next's redirect() throws, which is
// what stops the component before any JSX is evaluated — the same mechanism
// that makes the gate a gate in production.

const redirect = vi.hoisted(() => vi.fn((path: string) => {
  const e = new Error(`NEXT_REDIRECT:${path}`);
  (e as unknown as { digest: string }).digest = `NEXT_REDIRECT;${path}`;
  throw e;
}));

const state = vi.hoisted(() => ({
  user: { id: 'u1', email: null } as { id: string; email: string | null } | null,
  profile: null as Record<string, unknown> | null,
}));

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/auth', () => ({ getAuthUser: async () => state.user }));
vi.mock('@/lib/student-profile', () => ({ getStudentProfile: async () => state.profile }));
vi.mock('@/lib/chat-unread', () => ({
  getChatUnreadCount: async () => 0,
  getNotifUnreadCount: async () => 0,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
  }),
}));

import StudentLayout from '@/app/student/layout';

/** Runs the layout and reports the redirect it took, or null if it rendered. */
async function landingOf(profile: Record<string, unknown> | null): Promise<string | null> {
  state.profile = profile;
  redirect.mockClear();
  try {
    await StudentLayout({ children: null });
    return null;
  } catch (e) {
    const m = /NEXT_REDIRECT:(.*)$/.exec((e as Error).message ?? '');
    if (m) return m[1];
    throw e;
  }
}

const ANCHORED = '2026-08-01T00:00:00Z';
const student = (over: Record<string, unknown> = {}) => ({
  role: 'student',
  phone_verified_at: ANCHORED,
  onboarding_completed: true,
  notif_prefs: {},
  ...over,
});

beforeEach(() => {
  state.user = { id: 'u1', email: null };
});

describe('the student layout gates on the phone anchor', () => {
  // THE P0. The five Google accounts already in production hold live sessions
  // and can open /student/tracker directly; a redirect from /auth/callback is a
  // suggestion, this is the enforcement.
  it('sends an unanchored student to the link-phone gate', async () => {
    expect(await landingOf(student({ phone_verified_at: null }))).toBe('/auth/link-phone');
  });

  it('lets an anchored student through', async () => {
    expect(await landingOf(student())).toBeNull();
  });

  // appreview@careerrai.in — Apple's reviewer has no Indian SIM to receive an
  // OTP on. Gating them fails the next App Store submission.
  it('never gates the App Store reviewer or demo logins', async () => {
    expect(await landingOf(student({ phone_verified_at: null, is_test_account: true }))).toBeNull();
    expect(await landingOf(student({ phone_verified_at: null, is_demo: true }))).toBeNull();
  });

  // A transient profile read must not eject a real student into a verification
  // screen they do not need — the same rule the role redirects above it follow.
  it('degrades to rendering when the profile cannot be read', async () => {
    expect(await landingOf(null)).toBeNull();
  });

  // Ordering: non-students are routed by role BEFORE the anchor is considered,
  // so an unanchored counsellor still reaches their queue rather than an OTP
  // screen that would lock them out mid-shift.
  it('routes a non-student by role even when unanchored', async () => {
    expect(await landingOf({ role: 'sales', phone_verified_at: null })).toBe('/');
    expect(await landingOf({ role: 'buddy', phone_verified_at: null })).toBe('/buddy/home');
    expect(await landingOf({ role: 'admin', phone_verified_at: null })).toBe('/admin');
  });

  it('still requires a session at all', async () => {
    state.user = null;
    expect(await landingOf(student())).toBe('/login');
  });
});
