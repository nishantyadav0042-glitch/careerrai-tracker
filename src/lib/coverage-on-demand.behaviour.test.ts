import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── "UPDATE WHERE YOU STAND" MUST ACTUALLY OPEN (30 Aug) ────────────────────
//
// The coverage review had a weekly schedule and no door. A student who wanted
// to correct her syllabus status today had no way in, so she used Delete
// Account and signed up again — the only self-service "redo" the app offered.
//
// The button that fixes that is worthless unless this route answers an
// on-demand request. The sheet closes itself on `{ due: false }`
// (`if (!json.due) { onDone(); return; }`), so a route that kept applying the
// schedule would give the student a button that opens and instantly shuts —
// worse than no button, because it looks like the app is broken.
//
// Behaviour, not source text: these call the real GET handler.

const state = vi.hoisted(() => ({
  reviewedAt: null as string | null,
  onboardingCompleted: true,
}));

// The route authenticates with the cookie-bound server client, not getAuthUser.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'stu-1' } }, error: null }) },
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self, eq: self, in: self, not: self, is: self, gte: self, lte: self,
        order: self, limit: self,
        maybeSingle: async () => ({
          data: table === 'profiles'
            ? { coverage_reviewed_at: state.reviewedAt, onboarding_completed: state.onboardingCompleted,
                onboarding_last_activity_at: null, created_at: '2026-08-01T00:00:00Z' }
            : null,
          error: null,
        }),
        single: async () => ({ data: null, error: null }),
        then: (res: (v: unknown) => void) => res({ data: [], error: null }),
      });
      return chain;
    },
  }),
}));

import { GET } from '@/app/api/coverage/weekly-review/route';

const req = (url: string) => new Request(url) as never;

beforeEach(() => {
  state.reviewedAt = new Date().toISOString(); // reviewed just now => NOT due
  state.onboardingCompleted = true;
});

describe('the coverage review answers an on-demand request', () => {
  // THE REGRESSION. Without ?onDemand=1 handling this returns due:false and the
  // student's own button slams shut in her face.
  it('returns due:true when the student asks, even though the week is not up', async () => {
    const res = await GET(req('https://careerrai.in/api/coverage/weekly-review?onDemand=1'));
    const body = await res.json();
    expect(body.due, 'the on-demand door is closed by the weekly schedule').toBe(true);
  });

  it('still returns due:false for the scheduled gate when no review is owed', async () => {
    const res = await GET(req('https://careerrai.in/api/coverage/weekly-review'));
    expect((await res.json()).due).toBe(false);
  });

  it('only the exact flag opens it — no truthy-string accident', async () => {
    for (const q of ['?onDemand=0', '?onDemand=false', '?onDemand=', '?onDemand=yes', '?other=1']) {
      const res = await GET(req(`https://careerrai.in/api/coverage/weekly-review${q}`));
      expect((await res.json()).due, `${q} opened the review`).toBe(false);
    }
  });

  it('a genuinely due review is still due without the flag', async () => {
    state.reviewedAt = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const res = await GET(req('https://careerrai.in/api/coverage/weekly-review'));
    expect((await res.json()).due).toBe(true);
  });
});
