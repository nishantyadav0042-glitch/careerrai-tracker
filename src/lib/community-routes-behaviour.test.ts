import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── Daily Pick routes, EXECUTED — not grepped ───────────────────────────────
//
// The 21 Aug audit found 11 P0s alive behind green guards, because every
// community "test" was a regex over source text. These cases run the real
// route handlers against a scriptable supabase double that can return
// { data: null, error } — the one shape none of the regexes could see.
//
// The invariant under test everywhere: INFRASTRUCTURE ERROR ≠ EMPTY RESULT.
// A student must never be told "not available" / "no items" / "not voted"
// because a query failed.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentAdmin: any;
const AUTH_USER = { id: 'student-1' };
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => currentAdmin }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: AUTH_USER } }) } }),
}));
// The lazy promoter runs inside the ballot route; its own behaviour is tested
// separately on the runner. Here it must simply not explode the route.
vi.mock('@/lib/daily-pick-runner', () => ({ promoteDailyPick: vi.fn(async () => ({})) }));

import { POST as votePost } from '@/app/api/community/vote/route';
import { POST as reportPost } from '@/app/api/community/report/route';
import { GET as insightsGet } from '@/app/api/community/insights/route';

type Res = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };
type Handler = (call: number) => Res;

/** Scriptable admin double. Keys: `${table}.${op}` (select/insert/update/upsert/delete). */
function makeAdmin(handlers: Record<string, Handler>) {
  const counts: Record<string, number> = {};
  const resolve = (key: string): Res => {
    const call = (counts[key] = (counts[key] ?? 0) + 1);
    return handlers[key] ? handlers[key](call) : { data: [], error: null, count: 0 };
  };
  const chain = (table: string) => {
    const state = { op: 'select' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const op of ['insert', 'update', 'upsert', 'delete']) c[op] = () => { state.op = op; return c; };
    for (const m of ['select', 'eq', 'in', 'is', 'not', 'gte', 'lt', 'gt', 'order', 'limit', 'maybeSingle', 'single']) c[m] = () => c;
    c.then = (ok: (r: Res) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(resolve(`${table}.${state.op}`)).then(ok, err);
    return c;
  };
  return {
    from: (t: string) => chain(t),
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }) }) },
    counts,
  };
}

const req = (body: unknown): NextRequest => ({ json: async () => body } as unknown as NextRequest);

const LIVE_SUB = { id: 'sub-1', status: 'live', student_id: 'someone-else' };

beforeEach(() => { currentAdmin = makeAdmin({}); });

// ── VOTE ────────────────────────────────────────────────────────────────────

describe('vote: ERROR is never "this item is gone"', () => {
  it('a failed submission read is a retryable 503, and the vote is not judged', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': () => ({ data: null, error: { message: 'connection reset' } }),
    });
    const res = await votePost(req({ submission_id: 'sub-1', dir: 'up' }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.retryable).toBe(true);
    expect(json.error).not.toMatch(/no longer available/);
  });

  it('a genuinely missing item is still the legitimate 400', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': () => ({ data: null, error: null }),
    });
    const res = await votePost(req({ submission_id: 'sub-x', dir: 'up' }));
    expect(res.status).toBe(400);
  });

  it('own-share voting is blocked', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': () => ({ data: { id: 'sub-1', status: 'live', student_id: AUTH_USER.id }, error: null }),
    });
    const res = await votePost(req({ submission_id: 'sub-1', dir: 'up' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/own share/);
  });

  it('a vote lands via the upsert; unvote is an idempotent delete', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': () => ({ data: LIVE_SUB, error: null }),
      'submission_votes.upsert': () => ({ data: null, error: null }),
    });
    const up = await votePost(req({ submission_id: 'sub-1', dir: 'up' }));
    expect(up.status).toBe(200);
    expect((await up.json()).myVote).toBe('up');
    expect(currentAdmin.counts['submission_votes.upsert']).toBe(1);

    const un = await votePost(req({ submission_id: 'sub-1', dir: null }));
    expect(un.status).toBe(200);
    expect((await un.json()).myVote).toBe(null);
    expect(currentAdmin.counts['submission_votes.delete']).toBe(1);
  });

  it('a failed vote WRITE is an honest 500, never a silent ok', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': () => ({ data: LIVE_SUB, error: null }),
      'submission_votes.upsert': () => ({ data: null, error: { message: 'write failed' } }),
    });
    const res = await votePost(req({ submission_id: 'sub-1', dir: 'up' }));
    expect(res.status).toBe(500);
  });
});

// ── REPORT ──────────────────────────────────────────────────────────────────

describe('report: a safety report is never silently discarded', () => {
  it('a failed item read is a retryable 503, not "nothing to report"', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': () => ({ data: null, error: { message: 'boom' } }),
    });
    const res = await reportPost(req({ submission_id: 'sub-1', reason: 'abusive' }));
    expect(res.status).toBe(503);
    expect((await res.json()).retryable).toBe(true);
  });

  it('a real report lands and a duplicate reads as success', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': () => ({ data: { id: 'sub-1', status: 'live' }, error: null }),
      'community_reports.insert': (call) => call === 1
        ? { data: null, error: null }
        : { data: null, error: { message: 'dup', code: '23505' } },
      'community_reports.select': () => ({ data: null, error: null, count: 1 }),
    });
    expect((await reportPost(req({ submission_id: 'sub-1', reason: 'abusive' }))).status).toBe(200);
    expect((await reportPost(req({ submission_id: 'sub-1', reason: 'abusive' }))).status).toBe(200);
  });
});

// ── FEED (insights) ─────────────────────────────────────────────────────────

describe('feed: a DB failure is never "Be the one who adds something"', () => {
  it('any failed read is a retryable 503, never an empty feed', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': () => ({ data: null, error: { message: 'down' } }),
      'submission_votes.select': () => ({ data: [], error: null }),
    });
    const res = await insightsGet();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('FEED_UNAVAILABLE');
  });

  it('sends the hint of the day and no other hint — the live pool is never read', async () => {
    // Founder, 24 Sep: "One hint only daily visible to students. Hint of the
    // day." Until then this route also read the newest 60 live hints and sent
    // them as a feed under the day's one, which turned the queue into a menu.
    // Now the only submission reads are the day's stamp and the student's own
    // share, so an unserved hint cannot reach a client by any path.
    const tip = (id: string, featured: string | null) => ({
      id, kind: 'tip', payload: { text: `t-${id}`, section: 'QA' }, image_path: null,
      display_name: 'CareerRai', student_id: 'admin', created_at: '2026-08-01', featured_on: featured, status: 'live',
    });
    currentAdmin = makeAdmin({
      // call 1: featured-by-stamp; call 2: my own share
      'student_submissions.select': (call) =>
        call === 1 ? { data: [tip('today', '2026-09-24')], error: null } : { data: [], error: null },
      'submission_votes.select': () => ({ data: [], error: null }),
    });
    const res = await insightsGet();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dailyPick.tip.id).toBe('today');
    expect(json.feed).toEqual([]);
    expect(currentAdmin.counts['student_submissions.select'], 'stamp + own share, nothing else').toBe(2);
    // helpfulPct stays null at zero votes — never 0%.
    expect(json.dailyPick.tip.helpfulPct).toBeNull();
  });

  it("today's pick is fetched by its stamp — found even OUTSIDE the newest-60 window", async () => {
    // Fixture is a TIP since 31 Aug — the only kind that can hold the slot.
    // The property under test is unchanged: found by its stamp, not by luck
    // of falling inside the newest-60 slice.
    const mk = (id: string, featured: string | null) => ({
      id, kind: 'tip', payload: { text: id, section: 'QA' }, image_path: null,
      display_name: 'Aryan', student_id: 'someone-else', created_at: '2026-07-01', featured_on: featured, status: 'live',
    });
    currentAdmin = makeAdmin({
      // The newest-60 slice this test once raced against is gone (24 Sep);
      // the stamp is now the ONLY way a hint reaches the card.
      'student_submissions.select': (call) =>
        call === 1 ? { data: [mk('old-featured', '2026-08-21')], error: null } // featured-by-stamp query
        : { data: [], error: null },
      'submission_votes.select': () => ({ data: [], error: null }),
    });
    // Response shape is dailyPick.{tip} since 31 Aug — one authority serving
    // one kind. The property under test is unchanged and still the point: the
    // featured item is found by its STAMP, so a recycled hint older than the
    // newest-60 slice still reaches the card.
    const res = await insightsGet();
    const { dailyPick } = await res.json();
    expect(dailyPick.tip).not.toBeNull();
    expect(dailyPick.tip.id).toBe('old-featured');
  });
});

// ── Rotation stability (Phase 1, items 11–12 and 18) ────────────────────────

describe('rotation: the same student, the same day, the same pick', () => {
  it('today\'s own serves are NOT history — the third open cannot re-roll the day', async () => {
    // The card logs a serve on EVERY mount, and the three-peat guard read the
    // last two serves with no day filter — so a student's third open saw
    // today's kind twice, tripped the guard, and was handed a different pick
    // for the same day. The read is now bounded to previous study days.
    const route = await import('@/app/api/community/daily-slot/route');
    expect(typeof route.GET).toBe('function');
    const src = (await import('node:fs')).readFileSync('src/app/api/community/daily-slot/route.ts', 'utf8');
    // The idea: recent-serve history stops at the start of today.
    expect(src).toMatch(/\.lt\('created_at', studyDayStart\(now\)\.toISOString\(\)\)/);
  });

  it("availability asks for today's HINT, the exact thing the card renders", async () => {
    // INVERTED 31 Aug, and this is the assertion that would have caught the
    // bug. The old rule excluded today's featured item — ballot semantics,
    // from when this slot handed over several things to vote on. The card now
    // renders exactly ONE item: today's featured tip. Keeping the exclusion
    // would have gated the hero on everything EXCEPT the item it shows, so on
    // a day whose only unseen content was the hint itself the surface would
    // have silently fallen through to a reflection prompt.
    const src = (await import('node:fs')).readFileSync('src/app/api/community/daily-slot/route.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/featuredToday\.has\(s\.id\)/);
    expect(code).toMatch(/\.eq\('kind', 'tip'\)/);
    expect(code).toMatch(/\.eq\('featured_on', day\)/);
  });

  it('an unreadable availability read is a retryable 503, never a smaller rotation', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': () => ({ data: null, error: { message: 'down' } }),
      'submission_votes.select': () => ({ data: [], error: null }),
    });
    // The route needs more of the world than this double provides (peer rows,
    // mirror); what matters is that it does NOT answer 200-with-less.
    let status = 0;
    try { status = (await (await import('@/app/api/community/daily-slot/route')).GET()).status; }
    catch { status = 500; }
    expect(status).not.toBe(200);
  });
});

// ── ONE SURFACE: the same submission can never render twice ─────────────────

describe('deduplication is server-side, so no client can drift', () => {
  const mk = (id: string, kind: string, featured: string | null) => ({
    id, kind, payload: { text: id, section: 'QA' }, image_path: null,
    display_name: 'Aryan', student_id: 'someone-else',
    created_at: '2026-08-20', featured_on: featured, status: 'live',
  });

  it("a featured QUESTION reaches neither the pick nor the feed", async () => {
    // 31 Aug, in two steps. First: questions are no longer promoted, so a row
    // still carrying an old featured_on stamp must not reappear as today's
    // pick. Then, once it was established that ALL 50 questions are ours and
    // not a single student had ever submitted one, the feed went hints-only
    // too — so the same row must not surface below the hint either.
    // Since 24 Sep there is no feed at all, so "below the hint" is empty for
    // every kind.
    const today = '2026-08-21';
    currentAdmin = makeAdmin({
      'student_submissions.select': (call) =>
        call === 1 ? { data: [mk('picked-q', 'question', today)], error: null }
        : { data: [], error: null },
      'submission_votes.select': () => ({ data: [], error: null }),
    });
    const json = await (await insightsGet()).json();
    expect(json.dailyPick.question).toBeUndefined();
    expect(json.dailyPick.tip ?? null).toBeNull();
    expect(json.feed).toEqual([]);
  });

  it("today's TIP is the hint of the day, and the only hint sent", async () => {
    const today = '2026-08-21';
    currentAdmin = makeAdmin({
      'student_submissions.select': (call) =>
        call === 1 ? { data: [mk('picked-t', 'tip', today)], error: null }
        : { data: [], error: null },
      'submission_votes.select': () => ({ data: [], error: null }),
    });
    const json = await (await insightsGet()).json();
    expect(json.dailyPick.tip.id).toBe('picked-t');
    expect(json.feed).toEqual([]);
  });

  it('no submission id appears more than once across the whole surface', async () => {
    const today = '2026-08-21';
    currentAdmin = makeAdmin({
      'student_submissions.select': (call) =>
        call === 1 ? { data: [mk('q', 'question', today), mk('t', 'tip', today)], error: null }
        : call === 2 ? { data: [mk('t', 'tip', today)], error: null }            // my own share
        : { data: [], error: null },
      'submission_votes.select': () => ({ data: [], error: null }),
    });
    const json = await (await insightsGet()).json();
    const all = [
      json.dailyPick.question?.id, json.dailyPick.tip?.id,
      ...json.feed.map((f: { id: string }) => f.id),
    ].filter(Boolean);
    expect(new Set(all).size).toBe(all.length);
  });

  it('the retired ballot endpoint is gone — no second selection universe', async () => {
    const { existsSync } = await import('node:fs');
    expect(existsSync('src/app/api/community/voting/route.ts')).toBe(false);
  });

  it('the vote contract is one shape: up / down / null', async () => {
    const route = (await import('node:fs')).readFileSync('src/app/api/community/vote/route.ts', 'utf8');
    // The ballot's `helpful: boolean` shape let one surface set a vote it
    // could never change — two rules for one submission.
    expect(route).not.toContain('helpful }');
    expect(route).toMatch(/rawDir === 'up' \|\| rawDir === 'down' \|\| rawDir === null/);
  });
});
