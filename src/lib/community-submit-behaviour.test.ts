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
import { MIN_TIP_CHARS, MAX_TIP_CHARS } from '@/lib/community-pipeline';

type Res = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };
type Handler = (call: number) => Res;

/** Rows handed to .insert(), so a test can assert what was actually STORED. */
const inserted: Record<string, unknown>[] = [];

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
    for (const op of ['insert', 'update', 'upsert', 'delete']) {
      c[op] = (row?: unknown) => {
        state.op = op;
        if (op === 'insert' && row && typeof row === 'object') inserted.push(row as Record<string, unknown>);
        return c;
      };
    }
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
  inserted.length = 0;
  currentAdmin = makeAdmin(CLEAN);
});

// ── Part 8, REWRITTEN 31 Aug ────────────────────────────────────────────────
//
// These three used to assert that unhinted text is judged as a QUESTION. That
// was the 21 Aug fix for a real failure: the sheet enabled Send at 10 chars and
// allowed 600 while the server judged tips at 15–150, so it invited a share it
// then refused, with a message about a kind of thing the student was not
// writing.
//
// The founder's 31 Aug instruction — students must be able to add hints —
// requires text-only to be a HINT, because only a tip can be promoted to the
// daily slot. So the direction flips, but the property that actually mattered
// does not: THE CLIENT MUST NEVER INVITE A SHARE THE SERVER WILL REFUSE, AND AN
// ERROR MUST NAME THE THING THE STUDENT WAS ASKED FOR. The band is imported
// from the same constants the sheet imports, so the two cannot drift again.
describe('Part 8 — a student can contribute a hint', () => {
  it('a one-line hint is STORED as a tip, so it can reach the daily slot', async () => {
    // The screen returns null whenever it is unsure, which on a short hint is
    // often. Null used to fall through to 'question' and the hint was lost.
    safety.text.mockResolvedValue({ verdict: 'ok', section: 'QA', kind: null } as never);
    const res = await POST(post({ requestId: 'h1', text: 'Take total work as the LCM of the days, not 1.' }));
    expect(res.status).toBe(200);
    expect(inserted.at(-1)?.kind).toBe('tip');
  });

  it('a typed doubt the screen reads as a question still goes to the feed', async () => {
    safety.text.mockResolvedValue({ verdict: 'ok', section: 'QA', kind: 'question' } as never);
    const res = await POST(post({ requestId: 'h2', text: 'Why is option B wrong in this averages sum?' }));
    expect(res.status).toBe(200);
    expect(inserted.at(-1)?.kind).toBe('question');
  });

  it('the server floor is exactly the client Send-enable rule', async () => {
    expect((await POST(post({ requestId: 'h3', text: 'A'.repeat(MIN_TIP_CHARS) }))).status).toBe(200);
    const short = await POST(post({ requestId: 'h4', text: 'A'.repeat(MIN_TIP_CHARS - 1) }));
    expect(short.status).toBe(400);
  });

  it('the server ceiling is exactly the client cap, and says HINT when it refuses', async () => {
    expect((await POST(post({ requestId: 'h5', text: 'A'.repeat(MAX_TIP_CHARS) }))).status).toBe(200);
    const long = await POST(post({ requestId: 'h6', text: 'A'.repeat(MAX_TIP_CHARS + 1) }));
    expect(long.status).toBe(400);
    // The 21 Aug property, kept: the message names what they were asked for.
    const { error } = await long.json();
    expect(error).toMatch(/Hints are/);
    expect(error).not.toMatch(/question/i);
  });

  it('a photo keeps the wide caption band — a picture of a problem is a question', async () => {
    const res = await POST(post({ requestId: 'h7', ...IMG, text: 'A'.repeat(400) }));
    expect(res.status).toBe(200);
    expect(inserted.at(-1)?.kind).toBe('question');
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
