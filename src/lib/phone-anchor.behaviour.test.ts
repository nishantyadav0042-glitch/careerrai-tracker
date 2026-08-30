import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── THE LINK FLOW, EXERCISED (Incident #62) ────────────────────────────────
//
// identity.ts proves the RULES; this file proves the ROUTES obey them. The
// distinction is the whole reason this repo keeps a behaviour tier: the
// duplicate-account refusal in /auth/callback was a correct rule guarded by a
// condition (`!existing`) that could never be true, and it shipped for two days
// looking exactly like a working defence.
//
// So every test here calls the real route handler and asserts what it DID —
// the status it returned, and whether the anchor actually landed in the row.

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  profiles: [] as Row[],
  /** who profile_id_for_verified_phone should claim owns a number */
  phoneOwner: null as string | null,
  slotAllowed: true,
  otpOk: true,
  updateUserError: null as { message: string } | null,
  /** every profiles.update payload the routes wrote, in order */
  writes: [] as Row[],
}));

const clientIp = vi.hoisted(() => vi.fn(() => '203.0.113.7'));

vi.mock('@/lib/request-ip', () => ({ clientIp }));
vi.mock('@/lib/attempt-throttle', () => ({
  registerAttemptAndCheck: async () => false,
  clearAttempts: async () => {},
}));
vi.mock('@/lib/security-log', () => ({ logSecurityEvent: async () => {} }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (fn: string) => {
      if (fn === 'profile_id_for_verified_phone') {
        return Promise.resolve({ data: db.phoneOwner, error: null });
      }
      // claim_otp_send_slot — returns a .single()-able chain
      const result = {
        data: db.slotAllowed
          ? { allowed: true, reason: null, wait_secs: null }
          : { allowed: false, reason: 'cooldown', wait_secs: 12 },
        error: null,
      };
      return { single: async () => result, then: (r: (v: unknown) => void) => r(result) };
    },
    from: () => ({
      update: (values: Row) => ({
        eq: async () => { db.writes.push(values); return { error: null }; },
      }),
    }),
  }),
}));

const SIGNED_IN = { id: 'account-under-test', email: 'anshita@gmail.com' };
let sessionUser: typeof SIGNED_IN | null = SIGNED_IN;

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: sessionUser }, error: null }),
      updateUser: async () => ({ data: {}, error: db.updateUserError }),
      verifyOtp: async () => ({
        data: {},
        error: db.otpOk ? null : { message: 'Token has expired or is invalid' },
      }),
    },
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon';

import { POST as requestLink } from '@/app/api/auth/link-phone/request/route';
import { POST as verifyLink } from '@/app/api/auth/link-phone/verify/route';

function req(body: unknown) {
  return {
    json: async () => body,
    cookies: { getAll: () => [], get: () => undefined },
    headers: new Headers(),
  } as never;
}

beforeEach(() => {
  db.profiles = [];
  db.phoneOwner = null;
  db.slotAllowed = true;
  db.otpOk = true;
  db.updateUserError = null;
  db.writes = [];
  sessionUser = SIGNED_IN;
});

describe('requesting a link code', () => {
  it('sends a code for a free number', async () => {
    const res = await requestLink(req({ phone: '9876543210' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
  });

  it('refuses a number that is not an Indian mobile', async () => {
    const res = await requestLink(req({ phone: '12345' }));
    expect(res.status).toBe(400);
    expect((await res.json()).sent).toBe(false);
  });

  // THE duplicate-account defence, at the route. Auto-merging here would move a
  // real student's streak, plan, buddy and payments onto whoever holds the SIM.
  it('refuses — and does not merge — a number owned by another account', async () => {
    db.phoneOwner = 'somebody-else';
    const res = await requestLink(req({ phone: '9876543210' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.conflict).toBe(true);
    expect(db.writes, 'a conflicting link wrote to a profile').toEqual([]);
  });

  it('is idempotent when the number is already this account’s anchor', async () => {
    db.phoneOwner = SIGNED_IN.id;
    const res = await requestLink(req({ phone: '9876543210' }));
    expect((await res.json()).alreadyLinked).toBe(true);
    expect(db.writes, 'a no-op link still wrote').toEqual([]);
  });

  it('cannot be used to create an account — an unauthenticated call is refused', async () => {
    sessionUser = null;
    const res = await requestLink(req({ phone: '9876543210' }));
    expect(res.status).toBe(401);
  });

  // The route must not become a way around the SMS ceiling that the signup door
  // pays for (14 July audit).
  it('honours the shared per-phone send slot', async () => {
    db.slotAllowed = false;
    const res = await requestLink(req({ phone: '9876543210' }));
    expect(res.status).toBe(429);
  });

  it('reports a conflict when GoTrue rejects the number as already registered', async () => {
    db.updateUserError = { message: 'Phone number already registered by another user' };
    const res = await requestLink(req({ phone: '9876543210' }));
    expect(res.status).toBe(409);
    expect((await res.json()).conflict).toBe(true);
  });
});

describe('verifying the link code', () => {
  it('stamps the anchor in canonical E.164 on success', async () => {
    const res = await verifyLink(req({ phone: '9876543210', token: '123456' }));
    expect(res.status).toBe(200);
    expect(db.writes).toHaveLength(1);
    // Normalised by the server, NOT taken from the posted string — the exact
    // defect that put 92 bare 10-digit numbers into this column.
    expect(db.writes[0].phone).toBe('+919876543210');
    expect(typeof db.writes[0].phone_verified_at).toBe('string');
  });

  it('accepts the number in any format the student types it', async () => {
    await verifyLink(req({ phone: '+91 98765 43210', token: '123456' }));
    expect(db.writes[0].phone).toBe('+919876543210');
  });

  it('writes nothing when the code is wrong', async () => {
    db.otpOk = false;
    const res = await verifyLink(req({ phone: '9876543210', token: '000000' }));
    expect(res.status).toBe(401);
    expect(db.writes, 'a failed OTP anchored the account anyway').toEqual([]);
  });

  it('rejects a malformed code without calling Supabase', async () => {
    const res = await verifyLink(req({ phone: '9876543210', token: '12' }));
    expect(res.status).toBe(400);
    expect(db.writes).toEqual([]);
  });

  it('cannot anchor anything without a session', async () => {
    sessionUser = null;
    const res = await verifyLink(req({ phone: '9876543210', token: '123456' }));
    expect(res.status).toBe(401);
    expect(db.writes).toEqual([]);
  });
});
