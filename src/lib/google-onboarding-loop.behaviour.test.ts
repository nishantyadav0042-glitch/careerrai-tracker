import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';

// ── THE LOOP, EXECUTED ──────────────────────────────────────────────────────
//
// 29 Aug 2026. The founder finished every /start question, chose Continue with
// Google, and landed back at the start of onboarding. Finishing it again put
// him back at the same screen. There was no exit.
//
// Three separate defects on one path, none of which a structural guard could
// have caught — and one of which a structural guard actively DEMANDED:
//
//   1. /api/auth/stash-onboarding read `if (!ok) return 429` against a throttle
//      that returns TRUE when blocked. It rejected every request from the very
//      first one; onboarding_drafts held 0 rows in its entire life.
//   2. /auth/callback claimed the draft only inside `if (isNewUser)`. The
//      `on_auth_user_created` trigger inserts the profile inside the same
//      transaction that creates the auth user, so `existing` is never null by
//      the time this route runs — production shows profiles.created_at 21ms
//      EARLIER than auth.users.created_at. The branch was unreachable.
//   3. Because of (2), a student whose signup was interrupted could never
//      recover: their profile existed, so no draft could ever apply, so
//      onboarding_completed stayed false, so the layout sent them back to
//      /start — where finishing it reached the same dead end.
//
// Every one of those files greps clean. So these tests DRIVE the handlers and
// assert what they did, rather than asserting where the code sits (L2).
//
// WHAT IS STUBBED AND WHY: applyOnboarding is spied on rather than executed —
// it needs the topic-coverage, daily-hours and push-registry tables, and it
// already has direct proof of its own in onboarding-authority.guard.test.ts
// ("a complete draft sets onboarding_completed, which is the gate"). What is
// unproven without these tests is whether it is ever REACHED, and with which
// payload. That is exactly what broke, and it is what is asserted here.

/* eslint-disable @typescript-eslint/no-explicit-any */

const applyOnboarding = vi.hoisted(() => vi.fn(
  async (_admin: unknown, _userId: string, _payload: unknown) =>
    ({ fieldsWritten: ['x'], completed: true }),
));
const clientIp = vi.hoisted(() => vi.fn(() => '203.0.113.7'));

type Row = Record<string, any>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

function table(name: string): Row[] {
  db.tables[name] ??= [];
  return db.tables[name];
}

/**
 * A Supabase-shaped fake that actually FILTERS. A chain that answers every
 * query with the same canned row cannot tell "claimed the right draft" from
 * "claimed any draft", and cannot express single-use at all — the property
 * that stops a replayed cookie reapplying someone's answers.
 */
function makeAdmin() {
  return {
    from(name: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let pending: Row | null = null;   // update payload, applied on read/await
      let counting = false;             // select(_, { count: 'exact', head: true })
      const rows = () => table(name).filter((r) => filters.every((f) => f(r)));
      const commit = () => {
        const matched = rows();
        if (pending) for (const r of matched) Object.assign(r, pending);
        return matched;
      };
      const settle = () => (counting
        ? { count: rows().length, data: null, error: null }
        : { data: commit(), error: null });
      const chain: any = {
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count) counting = true;
          return chain;
        },
        eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return chain; },
        // The duplicate-account lookup excludes the caller's OWN row in SQL
        // (Incident #62), so the fake has to model it or the guard is untested.
        neq: (col: string, val: unknown) => { filters.push((r) => r[col] !== val); return chain; },
        is: (col: string, val: unknown) => { filters.push((r) => (r[col] ?? null) === val); return chain; },
        gte: (col: string, val: string) => { filters.push((r) => String(r[col]) >= val); return chain; },
        update: (values: Row) => { pending = values; return chain; },
        insert: (values: Row) => {
          const row = { id: values.id ?? randomUUID(), created_at: new Date().toISOString(), ...values };
          table(name).push(row);
          const ins: any = {
            select: () => ins,
            single: async () => ({ data: row, error: null }),
            maybeSingle: async () => ({ data: row, error: null }),
            then: (res: any) => res({ data: row, error: null }),
          };
          return ins;
        },
        maybeSingle: async () => ({ data: commit()[0] ?? null, error: null }),
        single: async () => ({ data: commit()[0] ?? null, error: null }),
        delete: () => { for (const r of rows()) table(name).splice(table(name).indexOf(r), 1); return chain; },
        // `await admin.from(t).select(...).eq(...)` with no .single() — the
        // throttle's head counts and the callback's email refresh both do this.
        then: (res: any) => res(settle()),
      };
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin() }));
vi.mock('@/lib/onboarding-apply', () => ({ applyOnboarding }));
vi.mock('@/lib/request-ip', () => ({ clientIp }));

let authUser: any = null;
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: async () => ({ data: { user: authUser }, error: authUser ? null : { message: 'bad code' } }),
      verifyOtp: async () => ({ data: { user: authUser }, error: null }),
    },
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon';

import { GET } from '@/app/auth/callback/route';
import { POST as stash, COOKIE } from '@/app/api/auth/stash-onboarding/route';

const GOOGLE_USER = {
  id: 'auth-user-1',
  email: 'student@gmail.com',
  app_metadata: { provider: 'google' },
  identities: [{ provider: 'google' }],
};

/** A NextRequest-shaped double: the route reads url and cookies, nothing else. */
function callbackRequest(cookies: Record<string, string>) {
  return {
    url: 'https://careerrai.in/auth/callback?code=pkce-code',
    cookies: {
      get: (n: string) => (n in cookies ? { name: n, value: cookies[n] } : undefined),
      getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })),
    },
  } as any;
}

function stashRequest(body: unknown) {
  return { text: async () => JSON.stringify(body) } as any;
}

const DRAFT = { ambition_date: '2026-11-29', target_percentile: 98, topic_matrix: [] };

beforeEach(() => {
  db.tables = {};
  authUser = GOOGLE_USER;
  applyOnboarding.mockClear();
  clientIp.mockReturnValue('203.0.113.7');
});

// ─── Defect 1: the stash endpoint rejected everything ───────────────────────

describe('parking the /start answers before Google', () => {
  it('stores the very first draft from a fresh IP', async () => {
    // The inverted guard failed exactly here: request #1, nothing in the table,
    // limit nowhere near — and a 429. Zero drafts were ever written.
    const res = await stash(stashRequest(DRAFT));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stashed: true });
    expect(table('onboarding_drafts')).toHaveLength(1);
    expect(table('onboarding_drafts')[0].payload).toEqual(DRAFT);
  });

  it('hands back an HttpOnly cookie carrying only the id', async () => {
    const res = await stash(stashRequest(DRAFT));
    const cookie = res.cookies.get(COOKIE);
    expect(cookie?.value).toBe(table('onboarding_drafts')[0].id);
    expect(cookie?.httpOnly).toBe(true);
    // Must survive the top-level redirect back from accounts.google.com.
    expect(cookie?.sameSite).toBe('lax');
    // The answers never travel in the cookie — 53 topics exceed the ~4KB
    // ceiling browsers enforce by silently dropping the cookie.
    expect(JSON.stringify(cookie?.value)).not.toContain('2026-11-29');
  });

  it('keeps working for a whole campus behind one IP', async () => {
    // CGNAT is the norm for Indian mobile carriers and a college is one exit
    // address. A limit tuned for one human is a limit that blocks a college.
    for (let i = 0; i < 120; i++) {
      const res = await stash(stashRequest({ ...DRAFT, i }));
      expect(res.status, `student ${i + 1} from this IP was refused`).toBe(200);
    }
    expect(table('onboarding_drafts')).toHaveLength(120);
  });

  it('still refuses an anonymous writer hammering one IP', async () => {
    // The throttle is not gone, only correctly sized and correctly read.
    let blocked = 0;
    for (let i = 0; i < 340; i++) {
      if ((await stash(stashRequest(DRAFT))).status === 429) blocked++;
    }
    expect(blocked, 'the endpoint no longer throttles at all').toBeGreaterThan(0);
  });

  it('does not spend the login lockout budget', async () => {
    // A finished questionnaire is not a guess at a credential. Counted in the
    // same per-IP pool, honest funnel traffic from a shared address would push
    // that address past the LOGIN lockout and lock strangers out of their own
    // accounts, with nothing in the login path to explain why.
    for (let i = 0; i < 50; i++) await stash(stashRequest(DRAFT));
    const attempts = table('login_attempts');
    expect(attempts).toHaveLength(50);
    expect(attempts.every((r) => r.scope === 'onboarding-draft')).toBe(true);
    expect(attempts.filter((r) => r.scope === 'auth')).toHaveLength(0);
  });

  it('is not throttled by other people failing to log in from the same IP', async () => {
    // The functional half of the same rule. One exit IP for a campus means the
    // credential surfaces and the funnel are always seen as one address; if
    // they share a pool, whoever gets there first spends it for everyone.
    for (let i = 0; i < 400; i++) {
      table('login_attempts').push({
        credential: `victim-${i}@gmail.com`, ip: '203.0.113.7',
        scope: 'auth', created_at: new Date().toISOString(),
      });
    }
    const res = await stash(stashRequest(DRAFT));
    expect(res.status, 'failed logins from this IP blocked an unrelated signup').toBe(200);
    expect(table('onboarding_drafts')).toHaveLength(1);
  });

  it('never touches a profile — it runs with no account in existence', async () => {
    await stash(stashRequest(DRAFT));
    expect(db.tables.profiles ?? []).toHaveLength(0);
    expect(applyOnboarding).not.toHaveBeenCalled();
  });
});

// ─── Defects 2 & 3: the draft was never claimed, and could never recover ────

describe('coming back from Google', () => {
  /** What `on_auth_user_created` leaves behind before this route ever runs. */
  function triggerCreatedStub(over: Row = {}) {
    table('profiles').push({
      id: 'auth-user-1', role: 'student', email: 'student@gmail.com',
      full_name: 'Nishant Kumar', password_set: false,
      onboarding_completed: false, ...over,
    });
  }
  function parkedDraft(id = randomUUID(), over: Row = {}) {
    table('onboarding_drafts').push({ id, payload: DRAFT, consumed_at: null, ...over });
    return id;
  }

  it('applies the parked answers to the stub the trigger just created', async () => {
    // THE BUG. `existing` is non-null here for every Google signup, so the old
    // `if (isNewUser)` branch never ran and the student was sent back through
    // the questions they had finished seconds earlier.
    triggerCreatedStub();
    const id = parkedDraft();

    const res = await GET(callbackRequest({ [COOKIE]: id }));

    expect(applyOnboarding).toHaveBeenCalledTimes(1);
    expect(applyOnboarding.mock.calls[0][1]).toBe('auth-user-1');
    expect(applyOnboarding.mock.calls[0][2]).toEqual(DRAFT);
    // Incident #62: a Google arrival with no VERIFIED phone is not admitted to
    // the product. The draft is still applied — their answers are not thrown
    // away — but the destination is the anchor gate, carrying where they were
    // headed so the journey finishes once a number is attached.
    expect(res.headers.get('location'))
      .toBe('https://careerrai.in/auth/link-phone?dest=%2Fstudent%2Ftracker');
  });

  it('lets an interrupted signup recover on the next try', async () => {
    // The loop's teeth. The profile now EXISTS and onboarding is unfinished —
    // under the old rule that combination could never be repaired by any
    // number of retries, because the only branch that could repair it required
    // the profile not to exist.
    triggerCreatedStub();
    const id = parkedDraft();

    await GET(callbackRequest({ [COOKIE]: id }));

    expect(applyOnboarding, 'a returning-but-unfinished student is stuck forever')
      .toHaveBeenCalledTimes(1);
  });

  it('never overwrites a student who already finished onboarding', async () => {
    // The property the old `isNewUser` check was protecting. It survives, now
    // stated on the data rather than on an unreachable branch.
    triggerCreatedStub({ onboarding_completed: true });
    const id = parkedDraft();

    await GET(callbackRequest({ [COOKIE]: id }));

    expect(applyOnboarding).not.toHaveBeenCalled();
    expect(table('onboarding_drafts')[0].consumed_at, 'a completed student consumed the draft')
      .toBeNull();
  });

  it('applies a draft once, however many times the callback is replayed', async () => {
    // A refresh or a double-tapped redirect must not apply the same answers
    // twice. Claim-and-read in one statement, conditional on consumed_at null.
    triggerCreatedStub();
    const id = parkedDraft();

    await GET(callbackRequest({ [COOKIE]: id }));
    await GET(callbackRequest({ [COOKIE]: id }));

    expect(applyOnboarding).toHaveBeenCalledTimes(1);
    expect(table('onboarding_drafts')[0].consumed_by).toBe('auth-user-1');
  });

  it('does not hand a funnel draft to a buddy', async () => {
    triggerCreatedStub({ role: 'buddy' });
    const id = parkedDraft();

    await GET(callbackRequest({ [COOKIE]: id }));

    expect(applyOnboarding).not.toHaveBeenCalled();
  });

  it('signs the student in even when there is no draft at all', async () => {
    // Best effort by construction: the account and the session already exist by
    // the time the claim runs. A missing or expired draft costs the
    // questionnaire, never the account.
    triggerCreatedStub();

    const res = await GET(callbackRequest({}));

    expect(applyOnboarding).not.toHaveBeenCalled();
    // Incident #62: a Google arrival with no VERIFIED phone is not admitted to
    // the product. The draft is still applied — their answers are not thrown
    // away — but the destination is the anchor gate, carrying where they were
    // headed so the journey finishes once a number is attached.
    expect(res.headers.get('location'))
      .toBe('https://careerrai.in/auth/link-phone?dest=%2Fstudent%2Ftracker');
  });

  it('ignores a forged draft id instead of failing the sign-in', async () => {
    triggerCreatedStub();
    parkedDraft();

    const res = await GET(callbackRequest({ [COOKIE]: '../../etc/passwd' }));

    expect(applyOnboarding).not.toHaveBeenCalled();
    // Incident #62: a Google arrival with no VERIFIED phone is not admitted to
    // the product. The draft is still applied — their answers are not thrown
    // away — but the destination is the anchor gate, carrying where they were
    // headed so the journey finishes once a number is attached.
    expect(res.headers.get('location'))
      .toBe('https://careerrai.in/auth/link-phone?dest=%2Fstudent%2Ftracker');
    expect(table('onboarding_drafts')[0].consumed_at).toBeNull();
  });

  it('a stranger cannot claim a draft parked by someone else', async () => {
    // The id is the capability and it travels in an HttpOnly cookie, but the
    // single-use stamp is what makes a leaked id worthless after first use.
    triggerCreatedStub();
    const id = parkedDraft(randomUUID(), { consumed_at: '2026-08-29T05:00:00Z', consumed_by: 'someone-else' });

    await GET(callbackRequest({ [COOKIE]: id }));

    expect(applyOnboarding).not.toHaveBeenCalled();
    expect(table('onboarding_drafts')[0].consumed_by).toBe('someone-else');
  });
});

// ─── End to end: the two halves actually fit together ───────────────────────

describe('the whole hand-off', () => {
  it('carries the answers from /start through Google and into the authority', async () => {
    // Neither half is worth anything alone: a stash that stores a draft nobody
    // claims, or a claim for a draft nobody stored, both end at the same screen
    // the founder was stuck on. This runs the real cookie the real endpoint
    // issued through the real callback.
    const stashed = await stash(stashRequest(DRAFT));
    const cookie = stashed.cookies.get(COOKIE)!.value;

    table('profiles').push({
      id: 'auth-user-1', role: 'student', email: 'student@gmail.com',
      onboarding_completed: false, password_set: false,
    });

    const res = await GET(callbackRequest({ [COOKIE]: cookie }));

    expect(applyOnboarding).toHaveBeenCalledTimes(1);
    expect(applyOnboarding.mock.calls[0][2]).toEqual(DRAFT);
    // Incident #62: a Google arrival with no VERIFIED phone is not admitted to
    // the product. The draft is still applied — their answers are not thrown
    // away — but the destination is the anchor gate, carrying where they were
    // headed so the journey finishes once a number is attached.
    expect(res.headers.get('location'))
      .toBe('https://careerrai.in/auth/link-phone?dest=%2Fstudent%2Ftracker');
  });
});
