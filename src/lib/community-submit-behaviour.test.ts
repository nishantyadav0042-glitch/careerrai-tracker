import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── The submission pipeline, EXECUTED ───────────────────────────────────────
//
// Covers the spec's Part 8 (text-only), Part 7 (never lie about moderation),
// Part 9 (idempotency / ambiguous outcome) and Part 3 (progressive friction)
// against the real route.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentAdmin: any;
const AUTH_USER = { id: 'student-1' };
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => currentAdmin }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: AUTH_USER } }) } }),
}));
const safety = vi.hoisted(() => ({
  text: vi.fn(async () => ({ verdict: 'ok' as const, section: 'QA' as const, kind: 'question' as const })),
  image: vi.fn(async () => ({ verdict: 'ok' as const, section: 'QA' as const, coherence: 'coherent' as const, quality: 'usable' as const })),
}));
vi.mock('@/lib/community-safety', () => ({
  checkTipSafety: safety.text,
  checkImageSafety: safety.image,
}));

import { POST, GET } from '@/app/api/community/submit/route';

type Res = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };
type Handler = (call: number) => Res;

function makeAdmin(handlers: Record<string, Handler>) {
  const counts: Record<string, number> = {};
  const resolve = (key: string): Res => {
    const call = (counts[key] = (counts[key] ?? 0) + 1);
    return handlers[key] ? handlers[key](call) : { data: null, error: null, count: 0 };
  };
  const chain = (table: string) => {
    const state = { op: 'select' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const op of ['insert', 'update', 'upsert', 'delete']) c[op] = () => { state.op = op; return c; };
    for (const m of ['select', 'eq', 'in', 'is', 'gte', 'order', 'limit', 'maybeSingle', 'single']) c[m] = () => c;
    c.then = (ok: (r: Res) => unknown) => Promise.resolve(resolve(`${table}.${state.op}`)).then(ok);
    return c;
  };
  return {
    from: (t: string) => chain(t),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    counts,
  };
}

const post = (body: unknown): NextRequest => ({ json: async () => body } as unknown as NextRequest);
const getReq = (rid: string): NextRequest =>
  ({ nextUrl: { searchParams: new URLSearchParams({ requestId: rid }) } } as unknown as NextRequest);

/** No prior share, no replay — the clean first-submission world. */
const CLEAN: Record<string, Handler> = {
  'student_submissions.select': () => ({ data: null, error: null, count: 0 }),
  'student_submissions.insert': () => ({ data: null, error: null }),
};

const IMG = { image: 'x'.repeat(4000), image_mime: 'image/jpeg' };

beforeEach(() => {
  vi.clearAllMocks();
  safety.text.mockResolvedValue({ verdict: 'ok', section: 'QA', kind: 'question' });
  safety.image.mockResolvedValue({ verdict: 'ok', section: 'QA', coherence: 'coherent', quality: 'usable' });
  currentAdmin = makeAdmin(CLEAN);
});

describe('Part 8 — a typed question is never judged as a tip', () => {
  it('a 200-character question with NO kind is accepted', async () => {
    const res = await POST(post({ requestId: 'r1', text: 'Why is option B wrong here? '.repeat(8) }));
    expect(res.status).toBe(200);
    expect((await res.json()).published).toBe(true);
  });

  it('the 15–150 "tip" band never speaks to an unhinted share', async () => {
    // Exactly the founder's case: real question, longer than a tip.
    const res = await POST(post({ requestId: 'r2', text: 'A'.repeat(200) }));
    expect(res.status).toBe(200);
  });

  it('the server floor matches the client Send-enable rule (10 chars)', async () => {
    expect((await POST(post({ requestId: 'r3', text: 'A'.repeat(10) }))).status).toBe(200);
    const short = await POST(post({ requestId: 'r4', text: 'too short' }));
    expect(short.status).toBe(400);
    expect((await short.json()).error).not.toMatch(/Tips are/);
  });
});

describe('Part 7 — never claim published when it is only held', () => {
  it('a live share says students will vote on it', async () => {
    const res = await POST(post({ requestId: 'p1', text: 'A real CAT doubt about averages here' }));
    const json = await res.json();
    expect(json.published).toBe(true);
    expect(json.status).toBe('live');
    expect(json.message).toMatch(/vote on it/);
  });

  it('a Gemini outage holds it AND says so — no "students will now vote"', async () => {
    safety.text.mockResolvedValue({ verdict: 'manual' } as never);
    const res = await POST(post({ requestId: 'p2', text: 'A real CAT doubt about averages here' }));
    const json = await res.json();
    expect(json.published).toBe(false);
    expect(json.status).toBe('pending');
    expect(json.message).toMatch(/being checked/i);
    expect(json.message).not.toMatch(/vote on it/);
  });
});

describe('Part 3 — progressive friction, only for a problematic photo', () => {
  it('a coherent multi-part object (DI set) sails through untouched', async () => {
    safety.image.mockResolvedValue({ verdict: 'ok', section: 'DILR', coherence: 'coherent', quality: 'usable' } as never);
    const res = await POST(post({ requestId: 'f1', ...IMG }));
    expect(res.status).toBe(200);
  });

  it('several UNRELATED questions ask for a crop — the "3rd Question." case', async () => {
    safety.image.mockResolvedValue({ verdict: 'ok', section: 'QA', coherence: 'multiple', quality: 'usable' } as never);
    const res = await POST(post({ requestId: 'f2', ...IMG }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('IMAGE_MULTIPLE_OBJECTS');
  });

  it('an unreadable photo asks for a retake', async () => {
    safety.image.mockResolvedValue({ verdict: 'ok', section: 'QA', coherence: 'coherent', quality: 'blurry' } as never);
    expect((await POST(post({ requestId: 'f3', ...IMG }))).status).toBe(400);
  });

  it("'unclear' is guidance, never friction — it still publishes", async () => {
    safety.image.mockResolvedValue({ verdict: 'ok', section: null, coherence: 'unclear', quality: 'usable' } as never);
    expect((await POST(post({ requestId: 'f4', ...IMG }))).status).toBe(200);
  });

  it('the two safety gates run in PARALLEL for text+photo', async () => {
    let inFlight = 0; let maxParallel = 0;
    const slow = async () => {
      inFlight++; maxParallel = Math.max(maxParallel, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return { verdict: 'ok' as const };
    };
    safety.text.mockImplementation(slow as never);
    safety.image.mockImplementation(slow as never);
    await POST(post({ requestId: 'par', text: 'A real question about ratios', ...IMG }));
    expect(maxParallel).toBe(2);
  });
});

describe('Part 9 — ambiguous outcomes and idempotency', () => {
  it('a replay of a landed share returns its success, never a 429', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': () => ({ data: { id: 'sub-1', status: 'live' }, error: null }),
    });
    const res = await POST(post({ requestId: 'same', text: 'A real CAT doubt about averages' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.idempotent).toBe(true);
    expect(json.published).toBe(true);
    expect(currentAdmin.counts['student_submissions.insert']).toBeUndefined();
  });

  it('a replay of a HELD share reports held — not a false "live"', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': () => ({ data: { id: 'sub-1', status: 'pending' }, error: null }),
    });
    const json = await (await POST(post({ requestId: 'held', text: 'A real CAT doubt here' }))).json();
    expect(json.published).toBe(false);
    expect(json.message).toMatch(/being checked/i);
  });

  it('a failed replay lookup is UNKNOWN — never "no previous submission"', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': () => ({ data: null, error: { message: 'down' } }),
    });
    const res = await POST(post({ requestId: 'unk', text: 'A real CAT doubt here now' }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('RECONCILE_UNAVAILABLE');
    expect(currentAdmin.counts['student_submissions.insert']).toBeUndefined();
  });

  it('a concurrent duplicate (23505) is success, reporting the twin\'s status', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': (call) => call === 1
        ? { data: null, error: null, count: 0 }                       // replay lookup: none yet
        : { data: { status: 'live' }, error: null },                  // twin lookup after 23505
      'student_submissions.insert': () => ({ data: null, error: { message: 'dup', code: '23505' } }),
    });
    const json = await (await POST(post({ requestId: 'race', text: 'A real CAT doubt here now' }))).json();
    expect(json.idempotent).toBe(true);
    expect(json.published).toBe(true);
  });

  it('the rate limit states the state ONLY when the row is confirmed', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': (call) =>
        call === 1 ? { data: null, error: null, count: 0 }             // replay: none
        : call === 2 ? { data: null, error: null, count: 1 }           // count: already shared
        : { data: { id: 'prev', status: 'live' }, error: null },       // confirmation read
    });
    const res = await POST(post({ requestId: 'rl', text: 'Another question for today' }));
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('ALREADY_SHARED_TODAY');
  });

  it('a failed rate-limit count does NOT fail open', async () => {
    currentAdmin = makeAdmin({
      'student_submissions.select': (call) =>
        call === 1 ? { data: null, error: null, count: 0 }
        : { data: null, error: { message: 'count down' }, count: null },
    });
    const res = await POST(post({ requestId: 'fo', text: 'Another question for today' }));
    expect(res.status).toBe(503);
    expect(currentAdmin.counts['student_submissions.insert']).toBeUndefined();
  });

  it('reconcile: found → its honest message; unknown → 503, never "not found"', async () => {
    currentAdmin = makeAdmin({ 'student_submissions.select': () => ({ data: { id: 's', status: 'pending' }, error: null }) });
    const found = await (await GET(getReq('r'))).json();
    expect(found.found).toBe(true);
    expect(found.message).toMatch(/being checked/i);

    currentAdmin = makeAdmin({ 'student_submissions.select': () => ({ data: null, error: { message: 'down' } }) });
    const bad = await GET(getReq('r'));
    expect(bad.status).toBe(503);
    expect((await bad.json()).found).toBeUndefined();
  });
});
